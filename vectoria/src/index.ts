import { v4 as uuidv4 } from 'uuid';
import { VectorStore } from './lib/db';
import { TransformersEmbedder } from './lib/transformers-embedder';
import { OpenAIEmbedder, OpenAIConfig } from './lib/openai-embedder';
import { HNSWIndex } from './lib/hnsw';
import { cosineSimilarity } from './lib/vector';
import { IndexerConfig, EmbeddingModel, VectorDocument, SearchResult } from './types';

export * from './types';
export { OpenAIEmbedder };
export type { OpenAIConfig };

export class Vectoria {
  private db: VectorStore;
  private embedder: EmbeddingModel;
  private index: HNSWIndex;
  private initialized: boolean = false;

  constructor(config: IndexerConfig = {}) {
    this.db = new VectorStore(config.dbName || 'vectoria-db', config.storeName);
    this.index = new HNSWIndex(); // Default config
    
    if (config.customEmbedder) {
      this.embedder = config.customEmbedder;
    } else if (config.useLocalModel !== false) {
      this.embedder = new TransformersEmbedder(config.modelName, config.device, config.wasmPaths);
    } else {
      throw new Error("No embedder configured. Provide a customEmbedder or enable useLocalModel.");
    }
  }

  async init() {
    if (this.initialized) return;
    
    // Load index metadata
    const meta = await this.db.loadIndexMeta();
    
    if (meta) {
      console.log('Loading HNSW index from granular storage...');
      // Load all nodes
      const nodes = await this.db.getAllNodes();
      
      // Reconstruct HNSW
      const indexData = {
        ...meta,
        nodes: nodes
      };
      this.index = HNSWIndex.fromJSON(indexData);
    } else {
      console.log('No existing index found.');
    }
    this.initialized = true;
  }

  async addDocument(text: string, metadata: Record<string, any> = {}): Promise<VectorDocument> {
    await this.init();
    const embedding = await this.embedder.embed(text);
    const doc: VectorDocument = {
      id: uuidv4(),
      text,
      metadata,
      embedding,
      createdAt: Date.now(),
    };
    
    // 1. Add to HNSW Index (Memory) & Get touched nodes
    const touchedIds = this.index.addPoint(doc.id, embedding);
    
    // 2. Save Document to IDB
    await this.db.add(doc);
    
    // 3. Persist Index (Granular)
    await this.saveIndex(touchedIds);

    return doc;
  }

  async addDocuments(items: { text: string; metadata?: Record<string, any> }[]): Promise<VectorDocument[]> {
    await this.init();
    
    const texts = items.map(i => i.text);
    const embeddings = await this.embedder.embedBatch(texts);
    
    const docs: VectorDocument[] = items.map((item, i) => ({
      id: uuidv4(),
      text: item.text,
      metadata: item.metadata || {},
      embedding: embeddings[i],
      createdAt: Date.now(),
    }));

    // 1. Add to HNSW Index & Collect touched nodes
    const allTouchedIds = new Set<string>();
    for (const doc of docs) {
      if (doc.embedding) {
        const touched = this.index.addPoint(doc.id, doc.embedding);
        touched.forEach(id => allTouchedIds.add(id));
      }
    }

    // 2. Save to IDB
    await this.db.addMany(docs);

    // 3. Persist Index (Granular)
    await this.saveIndex(allTouchedIds);

    return docs;
  }

  // Low-level method to index fully formed documents (used for migration/restoration)
  async indexDocuments(docs: VectorDocument[]): Promise<void> {
    await this.init();
    
    const allTouchedIds = new Set<string>();
    for (const doc of docs) {
      if (doc.embedding) {
        const touched = this.index.addPoint(doc.id, doc.embedding);
        touched.forEach(id => allTouchedIds.add(id));
      }
    }

    // Save to IDB
    await this.db.addMany(docs);

    // Persist Index
    await this.saveIndex(allTouchedIds);
  }

  async resetIndex(): Promise<void> {
    this.index = new HNSWIndex();
    await this.db.clearIndex(); // We need to add this to DB
  }

  async search(query: string, topK: number = 5, useBruteForce: boolean = false): Promise<SearchResult[]> {
    await this.init();
    const queryEmbedding = await this.embedder.embed(query);
    
    let results: { id: string; score: number }[] = [];

    if (useBruteForce) {
      // Brute-force search for verification
      const allDocs = await this.db.getAll();
      results = allDocs
        .filter(doc => doc.embedding && doc.embedding.length > 0)
        .map(doc => ({
          id: doc.id,
          score: cosineSimilarity(queryEmbedding, doc.embedding!)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    } else {
      // HNSW Index Search
      // Increase efSearch dynamically if needed, or rely on constructor default
      // For now, let's trust the default (which we bumped to 200)
      results = this.index.search(queryEmbedding, topK);
    }
    
    // Fetch Metadata from IDB (if not already fetched in brute force)
    // For brute force we already have docs, but to keep logic unified we re-fetch or optimize
    // Optimization: if brute force, we have docs. But let's keep it simple.
    const ids = results.map(r => r.id);
    const docs = await this.db.getMany(ids);
    
    const finalResults = results.map((r, i) => {
      const doc = docs[i];
      if (!doc) {
        console.warn(`Document not found in IDB for ID: ${r.id} (Score: ${r.score})`);
        return null;
      }
      return {
        ...doc,
        score: r.score
      };
    }).filter(Boolean) as SearchResult[];

    if (finalResults.length === 0 && results.length > 0) {
      console.error('Search returned results from Index but they were filtered out because they are missing in IDB. Ghost nodes?');
    }

    return finalResults;
  }

  async getAllDocuments(): Promise<VectorDocument[]> {
    return this.db.getAll();
  }
  
  async clear(): Promise<void> {
    this.index = new HNSWIndex();
    await this.db.clear();
  }

  private async saveIndex(touchedIds?: Set<string>) {
    // Save metadata
    const json = this.index.toJSON();
    // We only need top-level meta, not nodes array for meta store
    const { nodes, ...meta } = json;
    await this.db.saveIndexMeta(meta);

    // Save nodes
    if (touchedIds) {
      const nodesToSave = [];
      for (const id of touchedIds) {
        const node = this.index.getNode(id);
        if (node) {
          // Convert Float32Array to regular array for IDB storage if needed, 
          // but IDB supports TypedArrays. However, toJSON logic in HNSW converts it.
          // Let's keep it consistent with HNSW.toJSON logic for now or optimize.
          // HNSW.toJSON converts to array. Let's do same here for safety.
          nodesToSave.push({
            ...node,
            vector: Array.from(node.vector)
          });
        }
      }
      if (nodesToSave.length > 0) {
        await this.db.saveNodes(nodesToSave);
      }
    } else {
      // Full save (e.g. migration)
      await this.db.saveNodes(json.nodes);
    }
  }
}
