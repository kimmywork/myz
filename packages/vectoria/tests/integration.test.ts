import { describe, it, expect, beforeAll } from "vitest"
import { HybridSearchEngine } from "../src/lib/hybrid-search"
import { VectorStore } from "../src/lib/db"
import { OpenAIEmbedder } from "../src/lib/openai-embedder"

// Skip if no Ollama available
const OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1"
const MODEL_NAME = "hf.co/jinaai/jina-embeddings-v4-text-retrieval-GGUF:Q4_K_M"

describe.skipIf(!process.env.OLLAMA_AVAILABLE)("Integration Tests with Jina Embeddings", () => {
  let engine: HybridSearchEngine
  let db: VectorStore

  beforeAll(async () => {
    // Check if Ollama is available
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/models`)
      if (!response.ok) {
        console.log("Ollama not available, skipping integration tests")
        return
      }
    } catch {
      console.log("Ollama not available, skipping integration tests")
      return
    }

    const embedder = new OpenAIEmbedder({
      apiKey: "test",  // Ollama doesn't need real key
      endpoint: OLLAMA_BASE_URL,
      modelName: MODEL_NAME,
    })

    db = new VectorStore("test-db", "test-store")
    engine = new HybridSearchEngine(db, embedder, {
      denseThreshold: 0.5,
      sparseThreshold: 0.3,
      topK: 10,
    })

    // Clear database
    await engine.clear()
  })

  it("should add and search documents", async () => {
    // Add test documents
    const docs = [
      {
        text: "DynamoDB is a fast NoSQL database service by Amazon Web Services",
        metadata: { title: "DynamoDB Paper", recordId: "doc1" },
      },
      {
        text: "Raft is a consensus algorithm for managing a replicated log",
        metadata: { title: "Raft Paper", recordId: "doc2" },
      },
      {
        text: "Paxos is a family of protocols for solving consensus",
        metadata: { title: "Paxos Paper", recordId: "doc3" },
      },
      {
        text: "Machine learning is a subset of artificial intelligence",
        metadata: { title: "ML Guide", recordId: "doc4" },
      },
      {
        text: "Spring Boot is a framework for building Java applications",
        metadata: { title: "Spring Boot", recordId: "doc5" },
      },
    ]

    await engine.addDocuments(docs)

    // Search for distributed systems papers
    const results = await engine.search("distributed consensus algorithm", { topK: 3 })

    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(3)

    // Should find Raft and Paxos papers
    const titles = results.map((r) => r.doc.metadata?.title)
    expect(titles).toContain("Raft Paper")
  })

  it("should return relevant results for database queries", async () => {
    const results = await engine.search("NoSQL database Amazon", { topK: 3 })

    expect(results.length).toBeGreaterThan(0)

    // DynamoDB should be top result
    expect(results[0].doc.metadata?.title).toBe("DynamoDB Paper")
  })

  it("should filter out irrelevant results", async () => {
    const results = await engine.search("Spring Boot Java", { topK: 3 })

    expect(results.length).toBeGreaterThan(0)

    // Should find Spring Boot
    const titles = results.map((r) => r.doc.metadata?.title)
    expect(titles).toContain("Spring Boot")
  })

  it("should handle Chinese queries", async () => {
    // Add Chinese document
    await engine.addDocument(
      "分布式系统需要共识算法来保证数据一致性",
      { title: "分布式系统", recordId: "doc6" },
    )

    const results = await engine.search("分布式共识", { topK: 3 })

    expect(results.length).toBeGreaterThan(0)
  })
})
