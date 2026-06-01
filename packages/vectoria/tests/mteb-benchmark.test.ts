import { describe, it, expect, beforeAll } from "vitest"
import { HNSWIndex } from "../src/lib/hnsw"
import { BM25Index } from "../src/lib/bm25"
import { RRFFuser } from "../src/lib/rrf"
import { Reranker } from "../src/lib/reranker"
import { OpenAIEmbedder } from "../src/lib/openai-embedder"

// MTEB-style test datasets
const TEST_DATASETS = {
  // STS (Semantic Textual Similarity) style pairs
  sts: [
    {
      query: "A man is playing a guitar.",
      relevant: ["Someone is playing a musical instrument.", "A person is strumming a guitar."],
      irrelevant: ["The cat is sleeping on the couch.", "It is raining outside today."]
    },
    {
      query: "A woman is cooking in the kitchen.",
      relevant: ["Someone is preparing food.", "A person is making a meal."],
      irrelevant: ["The car is driving down the highway.", "Children are playing in the park."]
    },
    {
      query: "The weather is sunny and warm today.",
      relevant: ["It is a beautiful sunny day.", "The sun is shining brightly."],
      irrelevant: ["The stock market crashed yesterday.", "I need to buy new shoes."]
    }
  ],

  // Information Retrieval style
  ir: [
    {
      query: "What is machine learning?",
      relevant: [
        "Machine learning is a subset of artificial intelligence that provides systems the ability to automatically learn and improve from experience.",
        "Machine learning algorithms build mathematical models based on sample data to make predictions or decisions."
      ],
      irrelevant: [
        "The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris, France.",
        "Photosynthesis is a process used by plants to convert light energy into chemical energy."
      ]
    },
    {
      query: "How does a database index work?",
      relevant: [
        "A database index is a data structure that improves the speed of data retrieval operations on a database table.",
        "Indexes are used to quickly locate data without having to search every row in a database table."
      ],
      irrelevant: [
        "The human heart has four chambers: two atria and two ventricles.",
        "Photosynthesis occurs in the chloroplasts of plant cells."
      ]
    }
  ],

  // Classification style
  classification: [
    {
      query: "The patient was diagnosed with diabetes.",
      relevant: ["The doctor prescribed insulin for the diabetic patient.", "Blood sugar levels were elevated in the patient."],
      irrelevant: ["The football team won the championship.", "The stock market reached a new high."]
    },
    {
      query: "The company reported record profits this quarter.",
      relevant: ["Earnings exceeded analyst expectations.", "Revenue grew by 20% year-over-year."],
      irrelevant: ["The museum opened a new exhibition.", "The train arrived at the station on time."]
    }
  ]
}

const OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1"
const MODEL_NAME = "hf.co/jinaai/jina-embeddings-v4-text-retrieval-GGUF:Q4_K_M"

describe("MTEB-style Benchmark Tests", () => {
  let embedder: OpenAIEmbedder

  beforeAll(async () => {
    embedder = new OpenAIEmbedder({
      apiKey: "test",
      endpoint: OLLAMA_BASE_URL,
      modelName: MODEL_NAME,
    })
  })

  describe("Semantic Textual Similarity (STS)", () => {
    it("should rank relevant sentences higher than irrelevant ones", async () => {
      const hnswIndex = new HNSWIndex()
      const bm25Index = new BM25Index()

      for (let t = 0; t < TEST_DATASETS.sts.length; t++) {
        const testCase = TEST_DATASETS.sts[t]
        // Add all sentences to index
        const allSentences = [...testCase.relevant, ...testCase.irrelevant]
        const embeddings = await embedder.embedBatch(allSentences)

        allSentences.forEach((sentence, i) => {
          const id = `sts-${t}-${i}`
          hnswIndex.addPoint(id, embeddings[i])
          bm25Index.addDocument(id, sentence)
        })

        // Search
        const queryEmbedding = await embedder.embed(testCase.query)
        const denseResults = hnswIndex.search(queryEmbedding, 10)
        const sparseResults = bm25Index.search(testCase.query, 10)

        // RRF fusion
        const rrfFuser = new RRFFuser()
        const rrfResults = rrfFuser.fuseAndSort([
          denseResults.map((r) => ({ ...r, rank: 0 })),
          sparseResults.map((r) => ({ ...r, rank: 0 })),
        ])

        // Verify relevant sentences are ranked higher
        const relevantIds = testCase.relevant.map((_, i) => `sts-${t}-${i}`)
        const irrelevantIds = testCase.irrelevant.map((_, i) => `sts-${t}-${testCase.relevant.length + i}`)

        const relevantScores = rrfResults
          .filter((r) => relevantIds.includes(r.id))
          .map((r) => r.score)

        const irrelevantScores = rrfResults
          .filter((r) => irrelevantIds.includes(r.id))
          .map((r) => r.score)

        // At least one relevant should score higher than all irrelevant
        const maxRelevant = Math.max(...relevantScores)
        const maxIrrelevant = Math.max(...irrelevantScores)

        expect(maxRelevant).toBeGreaterThan(maxIrrelevant)
      }
    })
  })

  describe("Information Retrieval", () => {
    it("retrieve relevant documents for queries", async () => {
      const hnswIndex = new HNSWIndex()
      const bm25Index = new BM25Index()

      for (let t = 0; t < TEST_DATASETS.ir.length; t++) {
        const testCase = TEST_DATASETS.ir[t]
        // Add all documents to index
        const allDocs = [...testCase.relevant, ...testCase.irrelevant]
        const embeddings = await embedder.embedBatch(allDocs)

        allDocs.forEach((doc, i) => {
          const id = `ir-${t}-${i}`
          hnswIndex.addPoint(id, embeddings[i])
          bm25Index.addDocument(id, doc)
        })

        // Search
        const queryEmbedding = await embedder.embed(testCase.query)
        const denseResults = hnswIndex.search(queryEmbedding, 5)
        const sparseResults = bm25Index.search(testCase.query, 5)

        // RRF fusion
        const rrfFuser = new RRFFuser()
        const rrfResults = rrfFuser.fuseAndSort([
          denseResults.map((r) => ({ ...r, rank: 0 })),
          sparseResults.map((r) => ({ ...r, rank: 0 })),
        ])

        // Verify top results are relevant
        const topResults = rrfResults.slice(0, 2)
        const relevantIds = testCase.relevant.map((_, i) => `ir-${t}-${i}`)

        const topRelevantCount = topResults.filter((r) => relevantIds.includes(r.id)).length
        expect(topRelevantCount).toBeGreaterThan(0)
      }
    })
  })

  describe("BM25 Keyword Matching", () => {
    it("should match exact keywords", async () => {
      const bm25Index = new BM25Index()

      const docs = [
        { id: "doc1", text: "machine learning algorithms for classification" },
        { id: "doc2", text: "deep learning neural networks" },
        { id: "doc3", text: "database management systems" },
        { id: "doc4", text: "machine learning for natural language processing" },
      ]

      for (const doc of docs) {
        bm25Index.addDocument(doc.id, doc.text)
      }

      const results = bm25Index.search("machine learning", 5)
      expect(results.length).toBeGreaterThan(0)

      // doc1 and doc4 should be top results
      const topIds = results.slice(0, 2).map((r) => r.id)
      expect(topIds).toContain("doc1")
      expect(topIds).toContain("doc4")
    })

    it("should handle partial matches", async () => {
      const bm25Index = new BM25Index()

      const docs = [
        { id: "doc1", text: "distributed systems consensus algorithms" },
        { id: "doc2", text: "distributed database replication" },
        { id: "doc3", text: "machine learning classification" },
      ]

      for (const doc of docs) {
        bm25Index.addDocument(doc.id, doc.text)
      }

      const results = bm25Index.search("distributed systems", 5)
      expect(results.length).toBeGreaterThan(0)

      // doc1 should be top result (exact match)
      expect(results[0].id).toBe("doc1")
    })
  })

  describe("HNSW Vector Search", () => {
    it("should find similar vectors", async () => {
      const hnswIndex = new HNSWIndex()

      const vectors = [
        { id: "vec1", vector: [1, 0, 0] },
        { id: "vec2", vector: [0.9, 0.1, 0] },
        { id: "vec3", vector: [0, 1, 0] },
        { id: "vec4", vector: [0, 0, 1] },
      ]

      for (const vec of vectors) {
        hnswIndex.addPoint(vec.id, vec.vector)
      }

      const results = hnswIndex.search([1, 0, 0], 2)
      expect(results.length).toBe(2)
      expect(results[0].id).toBe("vec1")
      expect(results[1].id).toBe("vec2")
    })

    it("should handle high-dimensional vectors", async () => {
      const hnswIndex = new HNSWIndex()

      // Create random high-dimensional vectors
      const vectors = Array.from({ length: 100 }, (_, i) => ({
        id: `doc-${i}`,
        vector: Array.from({ length: 128 }, () => Math.random() - 0.5),
      }))

      for (const vec of vectors) {
        hnswIndex.addPoint(vec.id, vec.vector)
      }

      const query = Array.from({ length: 128 }, () => Math.random() - 0.5)
      const results = hnswIndex.search(query, 10)

      expect(results.length).toBe(10)
      results.forEach((r) => {
        expect(r.score).toBeGreaterThanOrEqual(-1)
        expect(r.score).toBeLessThanOrEqual(1)
      })
    })
  })

  describe("RRF Fusion", () => {
    it("should combine multiple ranking lists", async () => {
      const rrfFuser = new RRFFuser({ k: 60 })

      const list1 = [
        { id: "doc1", score: 0.9, rank: 1 },
        { id: "doc2", score: 0.8, rank: 2 },
        { id: "doc3", score: 0.7, rank: 3 },
      ]

      const list2 = [
        { id: "doc2", score: 0.85, rank: 1 },
        { id: "doc3", score: 0.75, rank: 2 },
        { id: "doc4", score: 0.65, rank: 3 },
      ]

      const results = rrfFuser.fuseAndSort([list1, list2])

      // doc2 appears in both lists at top positions, should be ranked first
      expect(results[0].id).toBe("doc2")
      expect(results.length).toBe(4)
    })

    it("should handle single list", async () => {
      const rrfFuser = new RRFFuser({ k: 60 })

      const list = [
        { id: "doc1", score: 0.9, rank: 1 },
        { id: "doc2", score: 0.8, rank: 2 },
      ]

      const results = rrfFuser.fuseAndSort([list])

      expect(results.length).toBe(2)
      expect(results[0].id).toBe("doc1")
    })
  })

  describe("Reranker", () => {
    it("should boost title matches", async () => {
      const reranker = new Reranker({ titleBoost: 2.0 })

      const results = [
        {
          doc: { id: "doc1", text: "Test document", metadata: { title: "Machine Learning Guide" }, createdAt: Date.now() },
          denseScore: 0.8, sparseScore: 0.5, rrfScore: 0.03, rerankerScore: 0, finalScore: 0,
        },
        {
          doc: { id: "doc2", text: "Another document", metadata: { title: "Unrelated Title" }, createdAt: Date.now() },
          denseScore: 0.7, sparseScore: 0.4, rrfScore: 0.025, rerankerScore: 0, finalScore: 0,
        },
      ]

      const reranked = reranker.rerank(results, "machine learning")
      expect(reranked[0].doc.id).toBe("doc1")
    })

    it("should apply recency boost", async () => {
      const reranker = new Reranker({ recencyBoost: { enabled: true, halfLifeDays: 30 } })

      const now = Date.now()
      const results = [
        {
          doc: { id: "doc1", text: "Recent document", metadata: {}, createdAt: now },
          denseScore: 0.8, sparseScore: 0.5, rrfScore: 0.03, rerankerScore: 0, finalScore: 0,
        },
        {
          doc: { id: "doc2", text: "Old document", metadata: {}, createdAt: now - 90 * 24 * 60 * 60 * 1000 },
          denseScore: 0.8, sparseScore: 0.5, rrfScore: 0.03, rerankerScore: 0, finalScore: 0,
        },
      ]

      const reranked = reranker.rerank(results, "test")
      expect(reranked[0].doc.id).toBe("doc1")
    })
  })
})
