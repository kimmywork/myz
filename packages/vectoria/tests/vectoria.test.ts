import { describe, it, expect, beforeEach } from "vitest"
import { HNSWIndex } from "../src/lib/hnsw"
import { BM25Index } from "../src/lib/bm25"
import { RRFFuser } from "../src/lib/rrf"
import { Reranker } from "../src/lib/reranker"
import { cosineSimilarity } from "../src/lib/vector"

describe("HNSW Index", () => {
  let index: HNSWIndex

  beforeEach(() => {
    index = new HNSWIndex({ M: 16, efConstruction: 100, efSearch: 50 })
  })

  it("should add and search points", () => {
    const vectors = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
    ]

    vectors.forEach((v, i) => {
      index.addPoint(`doc${i}`, v)
    })

    expect(index.size()).toBe(4)

    // Search for [1, 0, 0] - should find doc0 first
    const results = index.search([1, 0, 0], 2)
    expect(results.length).toBe(2)
    expect(results[0].id).toBe("doc0")
    expect(results[0].score).toBeGreaterThan(0.9)
  })

  it("should remove points", () => {
    index.addPoint("doc1", [1, 0, 0])
    index.addPoint("doc2", [0, 1, 0])

    expect(index.size()).toBe(2)

    index.removePoint("doc1")
    expect(index.size()).toBe(1)

    const results = index.search([1, 0, 0], 1)
    expect(results.length).toBe(1)
    expect(results[0].id).toBe("doc2")
  })

  it("should handle empty index", () => {
    const results = index.search([1, 0, 0], 5)
    expect(results.length).toBe(0)
  })

  it("should return correct cosine similarity scores", () => {
    index.addPoint("doc1", [1, 0, 0])
    index.addPoint("doc2", [0.707, 0.707, 0])  // 45 degrees

    const results = index.search([1, 0, 0], 2)
    expect(results[0].score).toBeGreaterThan(0.99)  // doc1 should be ~1.0
    expect(results[1].score).toBeGreaterThan(0.7)   // doc2 should be ~0.707
  })
})

describe("BM25 Index", () => {
  let index: BM25Index

  beforeEach(() => {
    index = new BM25Index({ k1: 1.2, b: 0.75 })
  })

  it("should add and search documents", () => {
    index.addDocument("doc1", "distributed systems consensus algorithms")
    index.addDocument("doc2", "machine learning neural networks")
    index.addDocument("doc3", "distributed databases replication")

    const results = index.search("distributed systems", 3)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe("doc1")  // Most relevant
  })

  it("should handle Chinese text", () => {
    index.addDocument("doc1", "分布式系统共识算法")
    index.addDocument("doc2", "机器学习神经网络")
    index.addDocument("doc3", "分布式数据库复制")

    const results = index.search("分布式系统", 3)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe("doc1")
  })

  it("should remove documents", () => {
    index.addDocument("doc1", "test document")
    index.addDocument("doc2", "another document")

    const stats1 = index.getStats()
    expect(stats1.docCount).toBe(2)

    index.removeDocument("doc1")

    const stats2 = index.getStats()
    expect(stats2.docCount).toBe(1)
  })

  it("should normalize scores", () => {
    index.addDocument("doc1", "exact match query")
    index.addDocument("doc2", "partial match")

    const results = index.search("exact match query", 2)
    expect(results[0].score).toBe(1.0)  // Should be normalized to 1.0
  })
})

describe("RRF Fuser", () => {
  let fuser: RRFFuser

  beforeEach(() => {
    fuser = new RRFFuser({ k: 60 })
  })

  it("should fuse two ranked lists", () => {
    const list1 = [
      { id: "doc1", score: 0.9, rank: 1 },
      { id: "doc2", score: 0.8, rank: 2 },
    ]
    const list2 = [
      { id: "doc2", score: 0.7, rank: 1 },
      { id: "doc3", score: 0.6, rank: 2 },
    ]

    const results = fuser.fuseAndSort([list1, list2])
    expect(results.length).toBe(3)

    // doc2 appears in both lists, should have highest score
    expect(results[0].id).toBe("doc2")
  })

  it("should handle empty lists", () => {
    const results = fuser.fuseAndSort([[], []])
    expect(results.length).toBe(0)
  })

  it("should give higher scores to higher ranked items", () => {
    const list = [
      { id: "doc1", score: 0.9, rank: 1 },
      { id: "doc2", score: 0.8, rank: 2 },
    ]

    const results = fuser.fuseAndSort([list])
    expect(results[0].score).toBeGreaterThan(results[1].score)
  })
})

describe("Reranker", () => {
  let reranker: Reranker

  beforeEach(() => {
    reranker = new Reranker({
      titleBoost: 2.0,
      lengthPenalty: { minLen: 50, maxLen: 500, penalty: 0.8 },
      recencyBoost: { enabled: true, halfLifeDays: 30 },
    })
  })

  it("should boost title matches", () => {
    const results = [
      {
        doc: {
          id: "doc1",
          text: "This is a test document about distributed systems",
          metadata: { title: "Distributed Systems Guide" },
          createdAt: Date.now(),
        },
        denseScore: 0.8,
        sparseScore: 0.5,
        rrfScore: 0.03,
        rerankerScore: 0,
        finalScore: 0,
      },
      {
        doc: {
          id: "doc2",
          text: "Another document about something else",
          metadata: { title: "Unrelated Title" },
          createdAt: Date.now(),
        },
        denseScore: 0.7,
        sparseScore: 0.4,
        rrfScore: 0.025,
        rerankerScore: 0,
        finalScore: 0,
      },
    ]

    const reranked = reranker.rerank(results, "distributed systems")
    expect(reranked[0].doc.id).toBe("doc1")  // Should be boosted by title match
  })

  it("should penalize too short or too long documents", () => {
    const results = [
      {
        doc: {
          id: "doc1",
          text: "Short",  // Too short (< 50 chars)
          metadata: {},
          createdAt: Date.now(),
        },
        denseScore: 0.9,
        sparseScore: 0.8,
        rrfScore: 0.04,
        rerankerScore: 0,
        finalScore: 0,
      },
      {
        doc: {
          id: "doc2",
          text: "A".repeat(600),  // Too long (> 500 chars)
          metadata: {},
          createdAt: Date.now(),
        },
        denseScore: 0.85,
        sparseScore: 0.75,
        rrfScore: 0.035,
        rerankerScore: 0,
        finalScore: 0,
      },
      {
        doc: {
          id: "doc3",
          text: "A".repeat(200),  // Good length
          metadata: {},
          createdAt: Date.now(),
        },
        denseScore: 0.8,
        sparseScore: 0.7,
        rrfScore: 0.03,
        rerankerScore: 0,
        finalScore: 0,
      },
    ]

    const reranked = reranker.rerank(results, "test query")
    // doc1 has higher rrfScore but gets length penalty (0.8x)
    // doc3 has no penalty, so finalScore comparison:
    // doc1: 0.04 * 0.8 = 0.032
    // doc3: 0.03 * 1.0 = 0.03
    // doc1 still ranks higher due to higher initial score
    expect(reranked[0].doc.id).toBe("doc1")
    // Verify penalty was applied (doc1's finalScore should be less than rrfScore)
    expect(reranked[0].finalScore).toBeLessThan(reranked[0].rrfScore)
  })

  it("should boost recent documents", () => {
    const now = Date.now()
    const results = [
      {
        doc: {
          id: "doc1",
          text: "Recent document",
          metadata: {},
          createdAt: now,
        },
        denseScore: 0.8,
        sparseScore: 0.5,
        rrfScore: 0.03,
        rerankerScore: 0,
        finalScore: 0,
      },
      {
        doc: {
          id: "doc2",
          text: "Old document",
          metadata: {},
          createdAt: now - 90 * 24 * 60 * 60 * 1000,  // 90 days ago
        },
        denseScore: 0.8,
        sparseScore: 0.5,
        rrfScore: 0.03,
        rerankerScore: 0,
        finalScore: 0,
      },
    ]

    const reranked = reranker.rerank(results, "test query")
    expect(reranked[0].doc.id).toBe("doc1")  // Recent should be ranked higher
  })
})

describe("Cosine Similarity", () => {
  it("should compute correct similarity", () => {
    const a = [1, 0, 0]
    const b = [1, 0, 0]
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5)
  })

  it("should handle orthogonal vectors", () => {
    const a = [1, 0, 0]
    const b = [0, 1, 0]
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5)
  })

  it("should handle opposite vectors", () => {
    const a = [1, 0, 0]
    const b = [-1, 0, 0]
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5)
  })
})
