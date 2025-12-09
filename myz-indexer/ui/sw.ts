/// <reference lib="webworker" />
import { MyZIndexer } from '../src/index';

declare const self: ServiceWorkerGlobalScope;

// Initialize the indexer inside the Service Worker
// Note: transformers.js will cache models in Cache API automatically
const indexer = new MyZIndexer({
  useLocalModel: true,
  modelName: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2' // Multilingual support (ZH/EN/JP)
});

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
        result = await indexer.search(payload.query);
        break;
      case 'GET_ALL':
        result = await indexer.getAllDocuments();
        break;
      case 'CLEAR':
        result = await indexer.clear();
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
