const statusEl = document.getElementById('status')!;
const logEl = document.getElementById('log')!;
const docCountEl = document.getElementById('docCount')!;
const indexTimeEl = document.getElementById('indexTime')!;
const searchTimeEl = document.getElementById('searchTime')!;
const btnLoadData = document.getElementById('btnLoadData') as HTMLButtonElement;
const btnRunIndex = document.getElementById('btnRunIndex') as HTMLButtonElement;
const btnRunSearch = document.getElementById('btnRunSearch') as HTMLButtonElement;
const btnClear = document.getElementById('btnClear') as HTMLButtonElement;
const batchSizeInput = document.getElementById('batchSize') as HTMLInputElement;
const maxDocsInput = document.getElementById('maxDocs') as HTMLInputElement;

let serviceWorker: ServiceWorker | null = null;
let parsedDocs: { text: string; source: string }[] = [];

function log(msg: string) {
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

async function init() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/ui/sw.ts', {
        type: 'module',
        scope: '/'
      });
      
      await navigator.serviceWorker.ready;
      serviceWorker = registration.active;
      statusEl.textContent = 'Service Worker Ready';
      log('Service Worker registered and ready.');
      
      // Check current DB state
      refreshStats();
    } catch (error) {
      statusEl.textContent = `SW Error: ${error}`;
      log(`Error: ${error}`);
    }
  }
}

function sendMessage(type: string, payload: any = {}) {
  return new Promise((resolve, reject) => {
    if (!serviceWorker) return reject('No SW');
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      if (event.data.error) reject(event.data.error);
      else resolve(event.data.result);
    };
    serviceWorker.postMessage({ type, payload }, [channel.port2]);
  });
}

async function refreshStats() {
  try {
    const docs: any = await sendMessage('GET_ALL');
    docCountEl.textContent = docs.length;
  } catch (e) {
    console.error(e);
  }
}

async function fetchAndParse(url: string, sourceName: string): Promise<{ text: string; source: string }[]> {
  log(`Fetching ${sourceName}...`);
  const res = await fetch(url);
  const text = await res.text();
  
  // Simple splitting by paragraphs
  const chunks = text.split(/\n\s*\n/)
    .map(t => t.trim())
    .filter(t => t.length > 20) // Filter out very short lines
    .map(t => t.slice(0, 300)); // Truncate to 300 chars to speed up embedding
    
  log(`Parsed ${chunks.length} chunks from ${sourceName}`);
  return chunks.map(c => ({ text: c, source: sourceName }));
}

btnLoadData.addEventListener('click', async () => {
  btnLoadData.disabled = true;
  parsedDocs = [];
  
  try {
    const files = [
      { url: '/data/紅樓夢.txt', name: 'Red Chamber' }
    ];

    for (const file of files) {
      const docs = await fetchAndParse(file.url, file.name);
      parsedDocs.push(...docs);
    }

    // Shuffle
    parsedDocs.sort(() => Math.random() - 0.5);
    
    // Limit
    const max = parseInt(maxDocsInput.value);
    if (parsedDocs.length > max) {
      parsedDocs = parsedDocs.slice(0, max);
      log(`Limited to ${max} documents.`);
    }

    log(`Total documents prepared: ${parsedDocs.length}`);
    btnRunIndex.disabled = false;
  } catch (e) {
    log(`Error loading data: ${e}`);
    btnLoadData.disabled = false;
  }
});

btnRunIndex.addEventListener('click', async () => {
  if (parsedDocs.length === 0) return;
  btnRunIndex.disabled = true;
  
  const batchSize = parseInt(batchSizeInput.value);
  const total = parsedDocs.length;
  let processed = 0;
  
  log(`Starting indexing of ${total} docs (Batch size: ${batchSize})...`);
  const startTime = performance.now();

  try {
    for (let i = 0; i < total; i += batchSize) {
      const batch = parsedDocs.slice(i, i + batchSize).map(d => ({
        text: d.text,
        metadata: { source: d.source }
      }));
      
      await sendMessage('BATCH_ADD', { items: batch });
      processed += batch.length;
      log(`Indexed ${processed}/${total}...`);
    }
    
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000;
    indexTimeEl.textContent = `${duration.toFixed(2)}s`;
    log(`Indexing complete! Time: ${duration.toFixed(2)}s. Avg: ${(duration / total * 1000).toFixed(2)}ms/doc`);
    
    refreshStats();
    btnRunSearch.disabled = false;
  } catch (e) {
    log(`Indexing error: ${e}`);
  } finally {
    btnRunIndex.disabled = false;
  }
});

btnRunSearch.addEventListener('click', async () => {
  const queries = [
    "林黛玉",
    "賈寶玉",
    "薛寶釵",
    "王熙鳳",
    "大觀園",
    "榮國府",
    "葬花吟"
  ];
  
  log(`Starting search test with ${queries.length} queries...`);
  const startTime = performance.now();
  
  for (const q of queries) {
    const startQ = performance.now();
    const results: any = await sendMessage('SEARCH', { query: q });
    const endQ = performance.now();
    
    log(`Query: "${q}" took ${(endQ - startQ).toFixed(2)}ms`);
    if (results.length > 0) {
      log(`  Top result: [${results[0].score.toFixed(4)}] ${results[0].text.substring(0, 50)}...`);
    } else {
      log(`  No results.`);
    }
  }
  
  const endTime = performance.now();
  const duration = (endTime - startTime);
  searchTimeEl.textContent = `${duration.toFixed(2)}ms`;
  log(`Search test complete. Total: ${duration.toFixed(2)}ms. Avg: ${(duration / queries.length).toFixed(2)}ms/query`);
});

btnClear.addEventListener('click', async () => {
  if (confirm('Clear DB?')) {
    await sendMessage('CLEAR');
    log('Database cleared.');
    refreshStats();
  }
});

init();
