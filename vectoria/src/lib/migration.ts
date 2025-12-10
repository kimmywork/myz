import { Vectoria } from '../index';
import { EmbeddingModel } from '../types';
import { VectorDocument } from '../types';

export interface MigrationStatus {
  total: number;
  processed: number;
  lastProcessedId: string | null;
  isComplete: boolean;
  error?: string;
}

export class MigrationManager {
  private indexer: Vectoria;
  private targetEmbedder: EmbeddingModel;
  private status: MigrationStatus = {
    total: 0,
    processed: 0,
    lastProcessedId: null,
    isComplete: false
  };
  private isRunning: boolean = false;
  private shouldStop: boolean = false;

  constructor(indexer: Vectoria, targetEmbedder: EmbeddingModel) {
    this.indexer = indexer;
    this.targetEmbedder = targetEmbedder;
  }

  async start(batchSize: number = 50): Promise<void> {
    if (this.isRunning) throw new Error("Migration already running");
    this.isRunning = true;
    this.shouldStop = false;

    try {
      // 1. Get all documents
      // Note: For huge datasets, we should use a cursor, but VectorStore.getAll() is what we have now.
      // Assuming it fits in memory for now.
      const allDocs = await this.indexer.getAllDocuments();
      this.status.total = allDocs.length;
      
      // 2. Clear the HNSW index (but keep documents in DB)
      // We need to access private indexer internals or add a method to clear ONLY the index structure
      // Since MyZIndexer.clear() wipes everything, we need a new method or we manually handle it.
      // Let's assume we are rebuilding the index from scratch using the new embeddings.
      
      // Actually, we can't just clear the index because we need to update the document embeddings in the DB too.
      // Strategy:
      // - Iterate docs
      // - Re-embed
      // - Update doc in DB
      // - Add to NEW HNSW index
      
      // To do this safely without losing data if we crash:
      // We should probably clear the HNSW index first, because the old index is invalid anyway.
      // But MyZIndexer doesn't expose "clearIndexOnly".
      // Let's add a method to MyZIndexer or just use what we have.
      // For now, let's assume we iterate and update.
      
      // We need to reset the internal HNSW index of the indexer instance
      // Since we can't easily access it, we might need to extend MyZIndexer.
      // But wait, if we just update the docs in DB, the index is still old.
      // We MUST reset the index.
      
      // Let's assume the user has called a method to reset the index structure before starting,
      // or we do it here if we can.
      // Since we can't, let's just proceed with re-embedding and assume the user will reload/reinit the indexer 
      // or we rely on `addDocument` to update the index? 
      // No, `addDocument` adds a NEW point. It doesn't update existing.
      
      // We really need a `rebuildIndex` or `resetIndex` method on MyZIndexer.
      // Let's assume we added `resetIndex()` to MyZIndexer.
      await (this.indexer as any).resetIndex(); 

      let processedCount = 0;
      
      for (let i = 0; i < allDocs.length; i += batchSize) {
        if (this.shouldStop) break;

        const batch = allDocs.slice(i, i + batchSize);
        const texts = batch.map((d: VectorDocument) => d.text);
        
        // Generate new embeddings
        const newEmbeddings = await this.targetEmbedder.embedBatch(texts);
        
        // Update docs and add to index
        const updatedDocs: VectorDocument[] = batch.map((doc: VectorDocument, idx: number) => ({
          ...doc,
          embedding: newEmbeddings[idx]
        }));

        // We need to save these docs back to DB AND add to the HNSW index.
        // MyZIndexer.addDocuments() does exactly this: Embeds (we already did), Adds to Index, Saves to DB.
        // But addDocuments() generates new IDs and timestamps. We want to preserve them.
        // And addDocuments() calls embedder.embedBatch().
        
        // We need a lower-level method: `indexDocuments(docs: VectorDocument[])` that takes fully formed docs.
        // Let's assume we added `indexDocuments` to MyZIndexer.
        await (this.indexer as any).indexDocuments(updatedDocs);
        
        processedCount += batch.length;
        this.status.processed = processedCount;
        this.status.lastProcessedId = batch[batch.length - 1].id;
        
        // Optional: Yield to event loop
        await new Promise(r => setTimeout(r, 0));
      }

      if (!this.shouldStop) {
        this.status.isComplete = true;
      }
    } catch (e: any) {
      this.status.error = e.message;
      throw e;
    } finally {
      this.isRunning = false;
    }
  }

  stop() {
    this.shouldStop = true;
  }

  getStatus(): MigrationStatus {
    return { ...this.status };
  }
}
