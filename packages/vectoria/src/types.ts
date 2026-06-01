export interface VectorDocument {
  id: string
  text: string
  metadata?: Record<string, any>
  embedding?: number[]
  tags?: string[]
  createdAt: number
}

export interface SearchResult extends VectorDocument {
  score: number
}

export interface EmbeddingModel {
  embed(text: string): Promise<number[]>
  embedBatch(texts: string[]): Promise<number[][]>
}

export interface OpenAIEmbedderConfig {
  apiKey: string
  endpoint?: string
  modelName?: string
  dimensions?: number
}

export interface HNSWConfig {
  M?: number
  efConstruction?: number
  efSearch?: number
  levelMultiplier?: number
}

export interface BM25Config {
  k1?: number
  b?: number
}

export interface RRFConfig {
  k?: number
}

export interface RerankerConfig {
  titleBoost?: number
  positionDecay?: number
  lengthPenalty?: {
    minLen?: number
    maxLen?: number
    penalty?: number
  }
  recencyBoost?: {
    enabled?: boolean
    halfLifeDays?: number
  }
}

export interface HybridSearchConfig {
  denseWeight?: number
  sparseWeight?: number
  topK?: number
  denseThreshold?: number  // Cosine similarity threshold for HNSW (0-1)
  sparseThreshold?: number  // BM25 normalized score threshold (0-1)
  useQuantization?: boolean
  reranker?: RerankerConfig
  rrf?: RRFConfig
  bm25?: BM25Config
  hnsw?: HNSWConfig
}

export interface RankedResult {
  id: string
  score: number
  rank: number
}

export interface HybridSearchResult {
  doc: VectorDocument
  denseScore: number
  sparseScore: number
  rrfScore: number
  rerankerScore: number
  finalScore: number
}

export interface IndexStats {
  vectorNodes: number
  bm25Terms: number
  bm25Docs: number
}
