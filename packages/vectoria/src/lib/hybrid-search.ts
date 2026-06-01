import type {
  VectorDocument,
  EmbeddingModel,
  HybridSearchConfig,
  HybridSearchResult,
  IndexStats,
} from "../types"
import { VectorStore } from "./db"
import { HNSWIndex } from "./hnsw"
import { BM25Index } from "./bm25"
import { RRFFuser } from "./rrf"
import { Reranker } from "./reranker"

/**
 * Hybrid search engine combining dense (HNSW) and sparse (BM25) retrieval
 * with RRF fusion and multi-factor reranking.
 */
export class HybridSearchEngine {
  private db: VectorStore
  private embedder: EmbeddingModel
  private hnswIndex: HNSWIndex
  private bm25Index: BM25Index
  private rrfFuser: RRFFuser
  private reranker: Reranker
  private config: Required<HybridSearchConfig>

  constructor(db: VectorStore, embedder: EmbeddingModel, config: HybridSearchConfig = {}) {
    this.db = db
    this.embedder = embedder
    this.hnswIndex = new HNSWIndex(config.hnsw)
    this.bm25Index = new BM25Index(config.bm25)
    this.rrfFuser = new RRFFuser(config.rrf)
    this.reranker = new Reranker(config.reranker)

    this.config = {
      denseWeight: config.denseWeight ?? 0.6,
      sparseWeight: config.sparseWeight ?? 0.4,
      topK: config.topK ?? 10,
      minScore: config.minScore ?? 0.1,
      useQuantization: config.useQuantization ?? true,
      reranker: config.reranker ?? {},
      rrf: config.rrf ?? {},
      bm25: config.bm25 ?? {},
      hnsw: config.hnsw ?? {},
    }
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

    // Rebuild BM25 index from documents
    const docs = await this.db.getAll()
    for (const doc of docs) {
      this.bm25Index.addDocument(doc.id, doc.text, doc.metadata)
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

    // Add to BM25 index
    this.bm25Index.addDocument(doc.id, text, metadata)

    // Save to database
    await this.db.add(doc)
    await this.saveIndex()

    return doc
  }

  /**
   * Add multiple documents in batch.
   */
  async addDocuments(
    items: Array<{
      id?: string
      text: string
      metadata?: Record<string, any>
      tags?: string[]
    }>,
  ): Promise<VectorDocument[]> {
    const { v4: uuidv4 } = await import("uuid")
    const texts = items.map((i) => i.text)
    const embeddings = await this.embedder.embedBatch(texts)

    const docs: VectorDocument[] = items.map((item, i) => ({
      id: item.id || uuidv4(),
      text: item.text,
      metadata: item.metadata || {},
      tags: item.tags || [],
      embedding: embeddings[i],
      createdAt: Date.now(),
    }))

    // Add to all indexes
    for (const doc of docs) {
      this.hnswIndex.addPoint(doc.id, doc.embedding!)
      this.bm25Index.addDocument(doc.id, doc.text, doc.metadata)
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
    this.bm25Index.removeDocument(docId)
    await this.db.delete(docId)
    await this.saveIndex()
  }

  /**
   * Search using hybrid approach with RRF fusion and reranking.
   */
  async search(
    query: string,
    options: { topK?: number; minScore?: number } = {},
  ): Promise<HybridSearchResult[]> {
    const topK = options.topK ?? this.config.topK
    const minScore = options.minScore ?? this.config.minScore

    // Step 1: Dense retrieval (HNSW)
    const queryEmbedding = await this.embedder.embed(query)
    const denseResults = this.hnswIndex.search(queryEmbedding, topK * 2)

    // Step 2: Sparse retrieval (BM25)
    const sparseResults = this.bm25Index.search(query, topK * 2)

    // Step 3: RRF fusion
    const rrfResults = this.rrfFuser.fuseAndSort([
      denseResults.map((r) => ({ ...r, rank: 0 })),
      sparseResults.map((r) => ({ ...r, rank: 0 })),
    ])

    // Step 4: Build hybrid results
    const hybridResults: HybridSearchResult[] = []
    for (const rrfResult of rrfResults.slice(0, topK * 2)) {
      const doc = await this.db.get(rrfResult.id)
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

    // Step 5: Rerank
    const reranked = this.reranker.rerank(hybridResults, query)

    // Step 6: Filter by minScore and return topK
    return reranked.filter((r) => r.finalScore >= minScore).slice(0, topK)
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
  getStats(): IndexStats {
    const bm25Stats = this.bm25Index.getStats()
    return {
      vectorNodes: this.hnswIndex.size(),
      bm25Terms: bm25Stats.termCount,
      bm25Docs: bm25Stats.docCount,
    }
  }

  /**
   * Clear all indexes.
   */
  async clear(): Promise<void> {
    this.hnswIndex = new HNSWIndex(this.config.hnsw)
    this.bm25Index.clear()
    await this.db.clear()
  }
}
