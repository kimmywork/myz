import { HNSWConfig } from './lib/hnsw';

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
  device?: 'auto' | 'webgpu' | 'wasm'; // Device for transformers.js
  wasmPaths?: string | Record<string, string>; // Custom paths for ONNX Runtime WASM files
  customEmbedder?: EmbeddingModel; // User provided embedder
  hnswConfig?: HNSWConfig;
}
