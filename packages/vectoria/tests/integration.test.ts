import { describe, it, expect, beforeAll } from "vitest"
import { HybridSearchEngine } from "../src/lib/hybrid-search"
import { OpenAIEmbedder } from "../src/lib/openai-embedder"
import { HNSWIndex } from "../src/lib/hnsw"
import { BM25Index } from "../src/lib/bm25"
import { RRFFuser } from "../src/lib/rrf"
import { Reranker } from "../src/lib/reranker"

// Skip if no Ollama available
const OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1"
const MODEL_NAME = "hf.co/jinaai/jina-embeddings-v4-text-retrieval-GGUF:Q4_K_M"

describe("Integration Tests with Jina Embeddings", () => {
  let engine: HybridSearchEngine

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

    // Use in-memory storage for testing
    const hnswIndex = new HNSWIndex()
    const bm25Index = new BM25Index()
    const rrfFuser = new RRFFuser()
    const reranker = new Reranker()

    // Create a mock engine that doesn't use IndexedDB
    engine = {
      search: async (query: string, options: any) => {
        const topK = options?.topK || 5
        const denseThreshold = options?.denseThreshold || 0.5
        const sparseThreshold = options?.sparseThreshold || 0.3

        // Get embeddings for query
        const queryEmbedding = await embedder.embed(query)

        // Search HNSW
        const denseResults = hnswIndex.search(queryEmbedding, topK * 2)
          .filter((r) => r.score >= denseThreshold)

        // Search BM25
        const sparseResults = bm25Index.search(query, topK * 2)
          .filter((r) => r.score >= sparseThreshold)

        // RRF fusion
        const rrfResults = rrfFuser.fuseAndSort([
          denseResults.map((r) => ({ ...r, rank: 0 })),
          sparseResults.map((r) => ({ ...r, rank: 0 })),
        ])

        // Build hybrid results
        const hybridResults = []
        for (const rrfResult of rrfResults.slice(0, topK * 2)) {
          const doc = (engine as any).docs?.get(rrfResult.id)
          if (!doc) continue

          const denseScore = denseResults.find((r) => r.id === rrfResult.id)?.score ?? 0
          const sparseScore = sparseResults.find((r) => r.id === rrfResult.id)?.score ?? 0

          hybridResults.push({
            doc,
            denseScore,
            sparseScore,
            rrfScore: rrfResult.score,
            rerankerScore: 0,
            finalScore: 0,
          })
        }

        // Rerank
        const reranked = reranker.rerank(hybridResults, query)

        return reranked.slice(0, topK)
      },
      addDocuments: async (items: any[]) => {
        const texts = items.map((i) => i.text)
        const embeddings = await embedder.embedBatch(texts)

        const docs = items.map((item, i) => ({
          id: item.id || `doc-${Date.now()}-${i}`,
          text: item.text,
          metadata: item.metadata || {},
          tags: item.tags || [],
          embedding: embeddings[i],
          createdAt: Date.now(),
        }))

        // Add to HNSW and BM25
        for (const doc of docs) {
          hnswIndex.addPoint(doc.id, doc.embedding)
          bm25Index.addDocument(doc.id, doc.text, doc.metadata)
        }

        // Store docs for retrieval
        if (!(engine as any).docs) {
          (engine as any).docs = new Map()
        }
        for (const doc of docs) {
          (engine as any).docs.set(doc.id, doc)
        }

        return docs
      },
      addDocument: async (text: string, metadata: any = {}, tags: string[] = []) => {
        const embedding = await embedder.embed(text)
        const id = `doc-${Date.now()}`
        const doc = { id, text, metadata, tags, embedding, createdAt: Date.now() }

        hnswIndex.addPoint(id, embedding)
        bm25Index.addDocument(id, text, metadata)

        if (!(engine as any).docs) {
          (engine as any).docs = new Map()
        }
        (engine as any).docs.set(id, doc)

        return doc
      },
      clear: async () => {
        hnswIndex.clear()
        bm25Index.clear()
        if ((engine as any).docs) {
          (engine as any).docs.clear()
        }
      },
    } as any
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
