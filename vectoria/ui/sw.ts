/// <reference lib="webworker" />
import { Vectoria, OpenAIEmbedder } from '../src/index';
import { MigrationManager } from '../src/lib/migration';

declare const self: ServiceWorkerGlobalScope;

// Initialize the indexer inside the Service Worker
// Note: transformers.js will cache models in Cache API automatically
let indexer = new Vectoria({
  useLocalModel: true,
  modelName: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2' // Multilingual support (ZH/EN/JP)
});

let migrationManager: MigrationManager | null = null;

self.addEventListener('install', () => {
  self.skipWaiting();
  console.log('SW Installed');
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  console.log('SW Activated');
});

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;
  const port = event.ports[0];

  try {
    let result;
    switch (type) {
      case 'ADD_DOC':
        result = await indexer.addDocument(payload.text);
        break;
      case 'BATCH_ADD':
        result = await indexer.addDocuments(payload.items);
        break;
      case 'SEARCH':
        result = await indexer.search(payload.query, 5, payload.useBruteForce);
        break;
      case 'GET_ALL':
        result = await indexer.getAllDocuments();
        break;
      case 'CLEAR':
        result = await indexer.clear();
        break;
      case 'CONFIGURE':
        // Re-initialize indexer with new config
        if (payload.type === 'openai') {
          indexer = new Vectoria({
            customEmbedder: new OpenAIEmbedder({
              apiKey: payload.openai.apiKey,
              endpoint: payload.openai.endpoint,
              modelName: payload.openai.modelName
            })
          });
        } else {
          indexer = new Vectoria({
            useLocalModel: true,
            modelName: payload.local?.modelName || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
          });
        }
        result = { success: true };
        break;
      case 'MIGRATE_START':
        // Target config is passed in payload
        let targetEmbedder;
        if (payload.target.type === 'openai') {
          targetEmbedder = new OpenAIEmbedder({
            apiKey: payload.target.openai.apiKey,
            endpoint: payload.target.openai.endpoint,
            modelName: payload.target.openai.modelName
          });
        } else {
          // For local, we can't easily instantiate just the embedder without the indexer wrapper 
          // unless we export TransformersEmbedder. 
          // But wait, MyZIndexer uses TransformersEmbedder internally.
          // Let's assume we only support migrating TO OpenAI for now or we need to export TransformersEmbedder.
          // Actually, we can just instantiate MyZIndexer with local config and grab its embedder? No, private.
          // We should export TransformersEmbedder from index.ts.
          throw new Error("Migration to local model not fully implemented in SW yet");
        }
        
        migrationManager = new MigrationManager(indexer, targetEmbedder);
        // Start in background (don't await)
        migrationManager.start().catch(err => console.error("Migration failed", err));
        result = { started: true };
        break;
      case 'MIGRATE_STATUS':
        if (!migrationManager) {
          result = { status: 'not_started' };
        } else {
          result = migrationManager.getStatus();
        }
        break;
      case 'MIGRATE_STOP':
        if (migrationManager) {
          migrationManager.stop();
          result = { stopped: true };
        } else {
          result = { error: 'No migration running' };
        }
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
    port.postMessage({ result });
  } catch (error: any) {
    console.error('SW Error:', error);
    port.postMessage({ error: error.message || String(error) });
  }
});
