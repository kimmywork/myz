# Vectoria

A hybrid search engine combining dense (HNSW) and sparse (BM25) retrieval with RRF fusion and multi-factor reranking.

## Features

- **HNSW Index**: Fast approximate nearest neighbor search for dense vectors
- **BM25 Index**: Classic information retrieval for keyword matching
- **RRF Fusion**: Reciprocal Rank Fusion for combining multiple ranking lists
- **Reranker**: Multi-factor reranking with title boost, length penalty, and recency boost
- **OpenAI SDK**: Compatible with OpenAI and Ollama embedding APIs

## Installation

```bash
npm install @myz/vectoria
```

## Usage

```typescript
import { HybridSearchEngine, VectorStore, OpenAIEmbedder } from "@myz/vectoria"

const embedder = new OpenAIEmbedder({
  apiKey: "your-api-key",
  endpoint: "https://api.openai.com/v1",
  modelName: "text-embedding-3-small",
})

const db = new VectorStore("my-db", "documents")
const engine = new HybridSearchEngine(db, embedder)

// Add documents
await engine.addDocument("Hello world", { title: "Greeting" })
await engine.addDocuments([
  { text: "Document 1", metadata: { title: "Doc 1" } },
  { text: "Document 2", metadata: { title: "Doc 2" } },
])

// Search
const results = await engine.search("Hello", { topK: 5 })
console.log(results)
```

## Demo

Visit the live demo: [https://myz-suite.github.io/vectoria/](https://myz-suite.github.io/vectoria/)

### Local Development

```bash
npm install
npm run dev
```

### Build

```bash
npm run build:demo
```

## API

### HybridSearchEngine

```typescript
class HybridSearchEngine {
  constructor(db: VectorStore, embedder: EmbeddingModel, config?: HybridSearchConfig)
  
  init(): Promise<void>
  addDocument(text: string, metadata?: Record<string, any>, tags?: string[]): Promise<VectorDocument>
  addDocuments(items: Array<{text: string, metadata?: Record<string, any>, tags?: string[]}>): Promise<VectorDocument[]>
  removeDocument(docId: string): Promise<void>
  search(query: string, options?: { topK?: number }): Promise<HybridSearchResult[]>
  getStats(): IndexStats
  clear(): Promise<void>
}
```

### HybridSearchConfig

```typescript
interface HybridSearchConfig {
  denseWeight?: number      // Weight for dense retrieval (default: 0.6)
  sparseWeight?: number     // Weight for sparse retrieval (default: 0.4)
  topK?: number             // Number of results to return (default: 10)
  denseThreshold?: number   // Cosine similarity threshold for HNSW (default: 0.5)
  sparseThreshold?: number  // BM25 normalized score threshold (default: 0.3)
  reranker?: RerankerConfig
  rrf?: RRFConfig
  bm25?: BM25Config
  hnsw?: HNSWConfig
}
```

### HybridSearchResult

```typescript
interface HybridSearchResult {
  doc: VectorDocument
  denseScore: number        // HNSW cosine similarity score
  sparseScore: number       // BM25 normalized score
  rrfScore: number          // RRF fusion score
  rerankerScore: number     // Score after reranking
  finalScore: number        // Final score (same as rerankerScore)
}
```

## License

MIT
