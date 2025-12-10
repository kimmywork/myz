# Vectoria

A lightweight, client-side vector search engine for the browser, built with HNSW and IndexedDB.

## Features

- **Client-Side Search**: Runs entirely in the browser using HNSW (Hierarchical Navigable Small World) algorithm.
- **Persistence**: Automatically saves index and documents to IndexedDB.
- **Flexible Embeddings**:
  - **Local**: Runs transformer models locally using `@huggingface/transformers` (ONNX/WASM).
  - **OpenAI**: Supports OpenAI-compatible APIs for generating embeddings.
  - **Custom**: Bring your own embedding function.
- **TypeScript Support**: Written in TypeScript with full type definitions.

## Installation

```bash
npm install vectoria
```

## Usage

### 1. Basic Usage (Local Embeddings)

By default, `Vectoria` uses a local transformer model (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`).

```typescript
import { Vectoria } from 'vectoria';

const indexer = new Vectoria({
  useLocalModel: true, // Default
});

await indexer.init();

// Add documents
await indexer.addDocuments([
  { text: 'The capital of France is Paris.', metadata: { category: 'geography' } },
  { text: 'Photosynthesis is how plants make food.', metadata: { category: 'science' } },
]);

// Search
const results = await indexer.search('Where is Paris?');
console.log(results);
// Output: [{ text: 'The capital of France is Paris.', score: 0.85, ... }]
```

### 2. Using OpenAI Embeddings

You can use OpenAI or any OpenAI-compatible endpoint (like LocalAI, Ollama, etc.).

```typescript
import { Vectoria, OpenAIEmbedder } from 'vectoria';

const indexer = new Vectoria({
  useLocalModel: false,
  customEmbedder: new OpenAIEmbedder({
    apiKey: 'sk-your-api-key',
    // endpoint: 'https://api.openai.com/v1', // Optional
    // modelName: 'text-embedding-3-small'    // Optional
  })
});

await indexer.init();
```

### 3. Custom Embedder

Implement the `EmbeddingModel` interface to use any embedding provider.

```typescript
import { Vectoria, EmbeddingModel } from 'vectoria';

class MyCustomEmbedder implements EmbeddingModel {
  async embed(text: string): Promise<number[]> {
    // Call your API here
    return [0.1, 0.2, ...];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embed(t)));
  }
}

const indexer = new Vectoria({
  customEmbedder: new MyCustomEmbedder()
});
```

## API Reference

### `Vectoria`

#### Constructor
`new Vectoria(config?: IndexerConfig)`

- `dbName`: IndexedDB database name (default: 'vectoria-db').
- `storeName`: Object store name (default: 'documents').
- `useLocalModel`: Boolean to enable local transformers (default: true).
- `modelName`: HuggingFace model ID for local model (default: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2').
- `customEmbedder`: Instance of `EmbeddingModel`.

#### Methods

- `init()`: Initialize the database and load the model.
- `addDocument(text: string, metadata?: any)`: Add a single document.
- `addDocuments(items: { text: string, metadata?: any }[])`: Add multiple documents.
- `search(query: string, topK?: number, useBruteForce?: boolean)`: Search for similar documents.
- `getAllDocuments()`: Retrieve all stored documents.
- `clear()`: Clear the database and index.
- `resetIndex()`: Rebuild the HNSW index from stored documents.

## License

MIT
