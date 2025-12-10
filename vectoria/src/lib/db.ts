import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { VectorDocument } from '../types';

interface MyZIndexerDB extends DBSchema {
  documents: {
    key: string;
    value: VectorDocument;
    indexes: { 'by-created': number };
  };
  meta: {
    key: string;
    value: any;
  };
  hnsw_nodes: {
    key: string;
    value: any; // Node structure
  };
}

export class VectorStore {
  private dbPromise: Promise<IDBPDatabase<MyZIndexerDB>>;

  constructor(dbName: string = 'myz-indexer-db', _storeName: string = 'documents') {
    this.dbPromise = openDB<MyZIndexerDB>(dbName, 3, { // Bump version to 3
      upgrade(db, _oldVersion, _newVersion, _transaction) {
        if (!db.objectStoreNames.contains('documents')) {
          const store = db.createObjectStore('documents', { keyPath: 'id' });
          store.createIndex('by-created', 'createdAt');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
        if (!db.objectStoreNames.contains('hnsw_nodes')) {
          db.createObjectStore('hnsw_nodes', { keyPath: 'id' });
        }
      },
    });
  }

  async add(doc: VectorDocument): Promise<void> {
    const db = await this.dbPromise;
    await db.put('documents', doc);
  }

  async addMany(docs: VectorDocument[]): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('documents', 'readwrite');
    const store = tx.objectStore('documents');
    await Promise.all([
      ...docs.map(doc => store.put(doc)),
      tx.done
    ]);
  }

  async saveNodes(nodes: any[]): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction('hnsw_nodes', 'readwrite');
    const store = tx.objectStore('hnsw_nodes');
    
    // Optimization: Use Promise.all for parallel writes is good, 
    // but for very large batches, it might be better to just await them sequentially 
    // to avoid memory pressure or browser limits, OR use a bulk put if the library supported it.
    // Since 'idb' wrapper doesn't have a bulkPut, we stick to Promise.all but we could chunk it.
    
    // Chunking for safety (e.g. 500 items per chunk)
    const chunkSize = 500;
    for (let i = 0; i < nodes.length; i += chunkSize) {
      const chunk = nodes.slice(i, i + chunkSize);
      await Promise.all(chunk.map(node => store.put(node)));
    }
    
    await tx.done;
  }

  async getAllNodes(): Promise<any[]> {
    const db = await this.dbPromise;
    return db.getAll('hnsw_nodes');
  }

  async get(id: string): Promise<VectorDocument | undefined> {
    const db = await this.dbPromise;
    return db.get('documents', id);
  }

  async getMany(ids: string[]): Promise<(VectorDocument | undefined)[]> {
    const db = await this.dbPromise;
    const tx = db.transaction('documents', 'readonly');
    const store = tx.objectStore('documents');
    return Promise.all(ids.map(id => store.get(id)));
  }

  async getAll(): Promise<VectorDocument[]> {
    const db = await this.dbPromise;
    return db.getAll('documents');
  }

  async delete(id: string): Promise<void> {
    const db = await this.dbPromise;
    await db.delete('documents', id);
  }
  
  async clear(): Promise<void> {
    const db = await this.dbPromise;
    await db.clear('documents');
    await db.clear('meta');
    await db.clear('hnsw_nodes');
  }

  async clearIndex(): Promise<void> {
    const db = await this.dbPromise;
    await db.clear('meta');
    await db.clear('hnsw_nodes');
  }

  async saveIndexMeta(data: any): Promise<void> {
    const db = await this.dbPromise;
    await db.put('meta', data, 'hnsw-meta');
  }

  async loadIndexMeta(): Promise<any> {
    const db = await this.dbPromise;
    return db.get('meta', 'hnsw-meta');
  }
}
