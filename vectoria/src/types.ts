export interface VectorDocument {
  id: string;
  text: string;
  metadata?: Record<string, any>;
  embedding?: number[];
  createdAt: number;
}

export interface SearchResult extends VectorDocument {
  score: number;
}

export interface EmbeddingModel {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface IndexerConfig {
  dbName?: string;
  storeName?: string;
  useLocalModel?: boolean; // If true, use transformers.js
  modelName?: string;      // e.g., 'Xenova/all-MiniLM-L6-v2'
  customEmbedder?: EmbeddingModel; // User provided embedder
}
