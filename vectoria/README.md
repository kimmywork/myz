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

## Thin Build & Custom WASM Paths

For advanced use cases where you want to exclude `@huggingface/transformers` from the bundle or serve ONNX WASM files from a custom location (e.g., for offline support).

### Using the Thin Build

Import from `vectoria/thin` to use the version that externalizes `@huggingface/transformers`. You must ensure `@huggingface/transformers` is installed in your project.

```typescript
import { Vectoria } from 'vectoria/thin';
```

### Configuring Custom WASM Paths

You can specify the location of the ONNX Runtime WASM files using the `wasmPaths` option. This is useful if you want to serve them from your own server instead of the default CDN.

```typescript
const indexer = new Vectoria({
  useLocalModel: true,
  wasmPaths: '/assets/wasm/', // URL prefix or object mapping
});
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

#### Tested Models

Vectoria supports any model compatible with [Transformers.js](https://huggingface.co/docs/transformers.js/index) and ONNX Runtime. You can configure the model using the `modelName` parameter. Below is a selection of models that have been tested and are available in the demo:

| Model | Size | Languages | Params |
|-------|------|-----------|--------|
| [Xenova/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2) | ~120MB | Multilingual | 117M |
| [Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2) | ~23MB | English | 22M |
| [Xenova/gte-small](https://huggingface.co/Xenova/gte-small) | ~33MB | English | 33M |
| [onnx-community/embeddinggemma-300m-ONNX](https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX) | ~300MB | English | 300M |
| [Xenova/bge-m3](https://huggingface.co/Xenova/bge-m3) | ~560MB | Multilingual | 567M |
| [Xenova/jina-embeddings-v2-base-en](https://huggingface.co/Xenova/jina-embeddings-v2-base-en) | ~130MB | English | 137M |
| [Xenova/multilingual-e5-large](https://huggingface.co/Xenova/multilingual-e5-large) | ~550MB | Multilingual | 560M |
| [Xenova/nomic-embed-text-v1](https://huggingface.co/Xenova/nomic-embed-text-v1) | ~130MB | English | 137M |
| [Xenova/GIST-small-Embedding-v0](https://huggingface.co/Xenova/GIST-small-Embedding-v0) | ~33MB | English | 33M |
| [Xenova/colbertv2.0](https://huggingface.co/Xenova/colbertv2.0) | ~105MB | English | 110M |
| [Xenova/UAE-Large-V1](https://huggingface.co/Xenova/UAE-Large-V1) | ~330MB | English | 335M |
| [Xenova/ernie-gram-zh](https://huggingface.co/Xenova/ernie-gram-zh) | ~105MB | Chinese | 110M |
| [Xenova/ernie-2.0-large-en](https://huggingface.co/Xenova/ernie-2.0-large-en) | ~330MB | English | 340M |
| [Xenova/w2v-bert-2.0](https://huggingface.co/Xenova/w2v-bert-2.0) | ~600MB | Multilingual | 600M |
| [Xenova/electra-base-discriminator](https://huggingface.co/Xenova/electra-base-discriminator) | ~105MB | English | 110M |
| [Xenova/conv-bert-base](https://huggingface.co/Xenova/conv-bert-base) | ~105MB | English | 110M |
| [onnx-community/Qwen3-Embedding-0.6B-ONNX](https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX) | ~600MB | Multilingual | 0.6B |
| [mixedbread-ai/mxbai-embed-large-v1](https://huggingface.co/mixedbread-ai/mxbai-embed-large-v1) | ~330MB | English | 335M |

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
