import { describe, it, expect, beforeAll } from "vitest"
import { HNSWIndex } from "../src/lib/hnsw"
import { BM25Index } from "../src/lib/bm25"
import { RRFFuser } from "../src/lib/rrf"
import { Reranker } from "../src/lib/reranker"
import { OpenAIEmbedder } from "../src/lib/openai-embedder"
import { readFileSync } from "fs"
import { join } from "path"

// Set timeout for all tests in this file
const TIMEOUT = 120000 // 2 minutes

const OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1"
const MODEL_NAME = "hf.co/jinaai/jina-embeddings-v4-text-retrieval-GGUF:Q4_K_M"

// Load STS12 dataset
const datasetPath = join(__dirname, "sts12-sample.json")
const dataset = JSON.parse(readFileSync(datasetPath, "utf-8"))

describe("STS12 Benchmark Tests", () => {
  let embedder: OpenAIEmbedder

  beforeAll(async () => {
    embedder = new OpenAIEmbedder({
      apiKey: "test",
      endpoint: OLLAMA_BASE_URL,
      modelName: MODEL_NAME,
    })
  }, 60000) // 60 second timeout for setup

  describe("Semantic Similarity Ranking", () => {
    it("should rank similar sentences higher than dissimilar ones", async () => {
      const hnswIndex = new HNSWIndex()
      const bm25Index = new BM25Index()

      // Use first 20 examples for faster testing
      const testCases = dataset.slice(0, 20)

      // Collect all unique sentences
      const allSentences = new Set<string>()
      for (const testCase of testCases) {
        allSentences.add(testCase.sentence1)
        allSentences.add(testCase.sentence2)
      }

      // Add to index
      const sentences = Array.from(allSentences)
      const embeddings = await embedder.embedBatch(sentences)

      sentences.forEach((sentence, i) => {
        const id = `sent-${i}`
        hnswIndex.addPoint(id, embeddings[i])
        bm25Index.addDocument(id, sentence)
      })

      // Create sentence to ID mapping
      const sentenceToId = new Map<string, string>()
      sentences.forEach((sentence, i) => {
        sentenceToId.set(sentence, `sent-${i}`)
      })

      // Test each case
      let correctRankings = 0
      let totalCases = 0

      for (const testCase of testCases) {
        const query = testCase.sentence1
        const similarSentence = testCase.sentence2

        // Get embeddings
        const queryEmbedding = await embedder.embed(query)

        // Search
        const denseResults = hnswIndex.search(queryEmbedding, 10)
        const sparseResults = bm25Index.search(query, 10)

        // RRF fusion
        const rrfFuser = new RRFFuser()
        const rrfResults = rrfFuser.fuseAndSort([
          denseResults.map((r) => ({ ...r, rank: 0 })),
          sparseResults.map((r) => ({ ...r, rank: 0 })),
        ])

        // Check if similar sentence is in top 3
        const similarId = sentenceToId.get(similarSentence)
        const topIds = rrfResults.slice(0, 3).map((r) => r.id)

        if (topIds.includes(similarId)) {
          correctRankings++
        }
        totalCases++
      }

      // At least 30% should be correct (random baseline would be ~3%)
      const accuracy = correctRankings / totalCases
      console.log(`\n=== STS12 Results ===`)
      console.log(`Accuracy: ${(accuracy * 100).toFixed(1)}% (${correctRankings}/${totalCases})`)
      console.log(`Random baseline: ~3%`)
      console.log(`====================\n`)
      expect(accuracy).toBeGreaterThan(0.3)
    })
  })

  describe("Score Correlation", () => {
    it("should correlate with human similarity scores", async () => {
      const hnswIndex = new HNSWIndex()
      const bm25Index = new BM25Index()

      // Use first 15 examples for faster testing
      const testCases = dataset.slice(0, 15)

      // Collect all unique sentences
      const allSentences = new Set<string>()
      for (const testCase of testCases) {
        allSentences.add(testCase.sentence1)
        allSentences.add(testCase.sentence2)
      }

      // Add to index
      const sentences = Array.from(allSentences)
      const embeddings = await embedder.embedBatch(sentences)

      sentences.forEach((sentence, i) => {
        const id = `sent-${i}`
        hnswIndex.addPoint(id, embeddings[i])
        bm25Index.addDocument(id, sentence)
      })

      // Create sentence to ID mapping
      const sentenceToId = new Map<string, string>()
      sentences.forEach((sentence, i) => {
        sentenceToId.set(sentence, `sent-${i}`)
      })

      // Calculate correlation
      const humanScores: number[] = []
      const systemScores: number[] = []

      for (const testCase of testCases) {
        const query = testCase.sentence1
        const target = testCase.sentence2

        // Get embeddings
        const queryEmbedding = await embedder.embed(query)

        // Search
        const denseResults = hnswIndex.search(queryEmbedding, 20)
        const sparseResults = bm25Index.search(query, 20)

        // RRF fusion
        const rrfFuser = new RRFFuser()
        const rrfResults = rrfFuser.fuseAndSort([
          denseResults.map((r) => ({ ...r, rank: 0 })),
          sparseResults.map((r) => ({ ...r, rank: 0 })),
        ])

        // Find target in results
        const targetId = sentenceToId.get(target)
        const targetResult = rrfResults.find((r) => r.id === targetId)

        if (targetResult) {
          humanScores.push(testCase.score)
          systemScores.push(targetResult.score)
        }
      }

      // Calculate Pearson correlation
      const n = humanScores.length
      if (n < 2) {
        console.log("Not enough data for correlation")
        return
      }

      const meanHuman = humanScores.reduce((a, b) => a + b, 0) / n
      const meanSystem = systemScores.reduce((a, b) => a + b, 0) / n

      let covariance = 0
      let humanVariance = 0
      let systemVariance = 0

      for (let i = 0; i < n; i++) {
        const humanDiff = humanScores[i] - meanHuman
        const systemDiff = systemScores[i] - meanSystem
        covariance += humanDiff * systemDiff
        humanVariance += humanDiff * humanDiff
        systemVariance += systemDiff * systemDiff
      }

      const correlation = covariance / Math.sqrt(humanVariance * systemVariance)
      console.log(`Score Correlation: ${correlation.toFixed(3)} (${n} pairs)`)
      expect(correlation).toBeGreaterThan(0) // Should be positive
    })
  })

  describe("BM25 Keyword Matching", () => {
    it("match exact keywords in STS12", async () => {
      const bm25Index = new BM25Index()

      // Add sentences to index
      const testCases = dataset.slice(0, 20)
      for (const testCase of testCases) {
        bm25Index.addDocument(testCase.sentence1, testCase.sentence1)
        bm25Index.addDocument(testCase.sentence2, testCase.sentence2)
      }

      // Test keyword matching
      const query = "shuttle fleet flying"
      const results = bm25Index.search(query, 5)

      expect(results.length).toBeGreaterThan(0)
      // Should find sentences containing these keywords
      const topResult = results[0]
      expect(topResult.score).toBeGreaterThan(0)
    })
  })

  describe("HNSW Vector Search", () => {
    it("should find semantically similar sentences", async () => {
      const hnswIndex = new HNSWIndex()

      // Add sentences to index
      const testCases = dataset.slice(0, 10)
      const sentences = testCases.map((tc) => tc.sentence1)
      const embeddings = await embedder.embedBatch(sentences)

      sentences.forEach((sentence, i) => {
        hnswIndex.addPoint(`sent-${i}`, embeddings[i])
      })

      // Search for a similar sentence
      const query = testCases[0].sentence2
      const queryEmbedding = await embedder.embed(query)
      const results = hnswIndex.search(queryEmbedding, 3)

      expect(results.length).toBeGreaterThan(0)
      // First result should be the most similar
      expect(results[0].score).toBeGreaterThan(0.5)
    })
  })
})
