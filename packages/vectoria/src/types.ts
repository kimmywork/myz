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
}

export interface IndexerConfig {
  dbName?: string
  storeName?: string
  embedder: EmbeddingModel
  hnswConfig?: HNSWConfig
}

export interface HNSWConfig {
  M?: number
  efConstruction?: number
  efSearch?: number
  levelMultiplier?: number
}

export interface NGramEntry {
  ngram: string
  docIds: Set<string>
}

export interface TagEntry {
  tag: string
  docIds: Set<string>
}

export interface HybridSearchOptions {
  vectorWeight?: number
  ngramWeight?: number
  tagWeight?: number
  topK?: number
  minScore?: number
  useBruteForce?: boolean
}

export interface HybridSearchResult {
  doc: VectorDocument
  vectorScore: number
  ngramScore: number
  tagScore: number
  combinedScore: number
}
