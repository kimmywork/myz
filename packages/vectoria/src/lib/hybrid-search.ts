import type {
  VectorDocument,
  EmbeddingModel,
  HybridSearchOptions,
  HybridSearchResult,
} from "../types"
import { VectorStore } from "./db"
import { HNSWIndex } from "./hnsw"
import { cosineSimilarity } from "./vector"
import { NGramIndex } from "./ngram-index"
import { TagIndex } from "./tag-index"

/**
 * Hybrid search engine that combines vector search, n-gram matching, and tag matching.
 */
export class HybridSearchEngine {
  private db: VectorStore
  private embedder: EmbeddingModel
  private hnswIndex: HNSWIndex
  private ngramIndex: NGramIndex
  private tagIndex: TagIndex

  constructor(db: VectorStore, embedder: EmbeddingModel) {
    this.db = db
    this.embedder = embedder
    this.hnswIndex = new HNSWIndex()
    this.ngramIndex = new NGramIndex()
    this.tagIndex = new TagIndex()
  }

  /**
   * Initialize the engine by loading existing data from the database.
   */
  async init(): Promise<void> {
    // Load HNSW index
    const meta = await this.db.loadIndexMeta()
    if (meta) {
      const nodes = await this.db.getAllNodes()
      this.hnswIndex = HNSWIndex.fromJSON({ ...meta, nodes })
    }

    // Rebuild n-gram and tag indexes from documents
    const docs = await this.db.getAll()
    for (const doc of docs) {
      this.ngramIndex.addDocument(doc.id, doc.text)
      if (doc.tags) {
        this.tagIndex.addDocument(doc.id, doc.tags)
      }
    }
  }

  /**
   * Add a document to all indexes.
   */
  async addDocument(
    text: string,
    metadata: Record<string, any> = {},
    tags: string[] = [],
  ): Promise<VectorDocument> {
    const { v4: uuidv4 } = await import("uuid")
    const embedding = await this.embedder.embed(text)

    const doc: VectorDocument = {
      id: uuidv4(),
      text,
      metadata,
      tags,
      embedding,
      createdAt: Date.now(),
    }

    // Add to HNSW index
    this.hnswIndex.addPoint(doc.id, embedding)

    // Add to n-gram index
    this.ngramIndex.addDocument(doc.id, text)

    // Add to tag index
    if (tags.length > 0) {
      this.tagIndex.addDocument(doc.id, tags)
    }

    // Save to database
    await this.db.add(doc)
    await this.saveIndex()

    return doc
  }

  /**
   * Add multiple documents in batch.
   */
  async addDocuments(
    items: Array<{ text: string; metadata?: Record<string, any>; tags?: string[] }>,
  ): Promise<VectorDocument[]> {
    const { v4: uuidv4 } = await import("uuid")
    const texts = items.map((i) => i.text)
    const embeddings = await this.embedder.embedBatch(texts)

    const docs: VectorDocument[] = items.map((item, i) => ({
      id: uuidv4(),
      text: item.text,
      metadata: item.metadata || {},
      tags: item.tags || [],
      embedding: embeddings[i],
      createdAt: Date.now(),
    }))

    // Add to all indexes
    for (const doc of docs) {
      this.hnswIndex.addPoint(doc.id, doc.embedding!)
      this.ngramIndex.addDocument(doc.id, doc.text)
      if (doc.tags && doc.tags.length > 0) {
        this.tagIndex.addDocument(doc.id, doc.tags)
      }
    }

    // Save to database
    await this.db.addMany(docs)
    await this.saveIndex()

    return docs
  }

  /**
   * Remove a document from all indexes.
   */
  async removeDocument(docId: string): Promise<void> {
    this.hnswIndex.removePoint(docId)
    this.ngramIndex.removeDocument(docId)
    this.tagIndex.removeDocument(docId)
    await this.db.delete(docId)
    await this.saveIndex()
  }

  /**
   * Search using hybrid approach.
   */
  async search(
    query: string,
    options: HybridSearchOptions = {},
  ): Promise<HybridSearchResult[]> {
    const {
      vectorWeight = 0.7,
      ngramWeight = 0.2,
      tagWeight = 0.1,
      topK = 10,
      minScore = 0.3,
      useBruteForce = false,
    } = options

    // Extract tags from query
    const queryTags = this.tagIndex.extractTagsFromQuery(query)

    // Run searches in parallel
    const [vectorScores, ngramScores, tagScores] = await Promise.all([
      this.vectorSearch(query, topK * 2, useBruteForce),
      Promise.resolve(this.ngramIndex.search(query)),
      Promise.resolve(this.tagIndex.search(queryTags)),
    ])

    // Collect all unique document IDs
    const allDocIds = new Set<string>()
    for (const [id] of vectorScores) allDocIds.add(id)
    for (const [id] of ngramScores) allDocIds.add(id)
    for (const [id] of tagScores) allDocIds.add(id)

    // Calculate combined scores
    const results: HybridSearchResult[] = []
    for (const docId of allDocIds) {
      const vs = vectorScores.get(docId) || 0
      const ns = ngramScores.get(docId) || 0
      const ts = tagScores.get(docId) || 0

      const combinedScore =
        vs * vectorWeight + ns * ngramWeight + ts * tagWeight

      if (combinedScore >= minScore) {
        const doc = await this.db.get(docId)
        if (doc) {
          results.push({
            doc,
            vectorScore: vs,
            ngramScore: ns,
            tagScore: ts,
            combinedScore,
          })
        }
      }
    }

    // Sort by combined score and return topK
    results.sort((a, b) => b.combinedScore - a.combinedScore)
    return results.slice(0, topK)
  }

  /**
   * Perform vector search.
   */
  private async vectorSearch(
    query: string,
    topK: number,
    useBruteForce: boolean,
  ): Promise<Map<string, number>> {
    const queryEmbedding = await this.embedder.embed(query)
    const scores = new Map<string, number>()

    if (useBruteForce) {
      const allDocs = await this.db.getAll()
      for (const doc of allDocs) {
        if (doc.embedding && doc.embedding.length > 0) {
          const score = cosineSimilarity(queryEmbedding, doc.embedding)
          scores.set(doc.id, score)
        }
      }
    } else {
      const results = this.hnswIndex.search(queryEmbedding, topK)
      for (const r of results) {
        scores.set(r.id, r.score)
      }
    }

    return scores
  }

  /**
   * Save index metadata to database.
   */
  private async saveIndex(): Promise<void> {
    const json = this.hnswIndex.toJSON()
    const { nodes, ...meta } = json
    await this.db.saveIndexMeta(meta)
  }

  /**
   * Get index statistics.
   */
  getStats(): {
    vectorNodes: number
    ngramStats: { ngramCount: number; docCount: number }
    tagStats: { tagCount: number; docCount: number }
  } {
    return {
      vectorNodes: this.hnswIndex.size(),
      ngramStats: this.ngramIndex.getStats(),
      tagStats: this.tagIndex.getStats(),
    }
  }

  /**
   * Clear all indexes.
   */
  async clear(): Promise<void> {
    this.hnswIndex = new HNSWIndex()
    this.ngramIndex.clear()
    this.tagIndex.clear()
    await this.db.clear()
  }
}
