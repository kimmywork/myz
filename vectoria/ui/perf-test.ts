import { IndexerClient } from './client';

const statusEl = document.getElementById('status')!;
const logEl = document.getElementById('log')!;
const docCountEl = document.getElementById('docCount')!;
const indexTimeEl = document.getElementById('indexTime')!;
const searchTimeEl = document.getElementById('searchTime')!;
// const btnLoadData = document.getElementById('btnLoadData') as HTMLButtonElement; // Removed
const btnLoadQA = document.getElementById('btnLoadQA') as HTMLButtonElement;
const btnLoadHF = document.getElementById('btnLoadHF') as HTMLButtonElement;
const btnRunIndex = document.getElementById('btnRunIndex') as HTMLButtonElement;
const btnRunSearch = document.getElementById('btnRunSearch') as HTMLButtonElement;
const btnClear = document.getElementById('btnClear') as HTMLButtonElement;
const batchSizeInput = document.getElementById('batchSize') as HTMLInputElement;
const useBruteForceInput = document.getElementById('useBruteForce') as HTMLInputElement;

let parsedDocs: { text: string; source: string }[] = [];

function log(msg: string) {
  const line = document.createElement('div');
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

const client = new IndexerClient((msg) => {
  statusEl.textContent = msg;
  log(msg);
});

async function refreshStats() {
  try {
    const docs: any = await client.sendMessage('GET_ALL');
    docCountEl.textContent = docs.length;
  } catch (e) {
    console.error(e);
  }
}

btnLoadQA.addEventListener('click', async () => {
  btnLoadQA.disabled = true;
  parsedDocs = [];
  
  try {
    log('Fetching QA Dataset...');
    const res = await fetch('data/qa_dataset.json');
    const data = await res.json();
    
    parsedDocs = data.map((item: any) => ({
      text: item.text,
      source: `QA-${item.category}`
    }));
    
    log(`Loaded ${parsedDocs.length} QA documents.`);
    
    // Auto-clear for clean test
    await client.sendMessage('CLEAR');
    log('Database cleared for QA test.');
    refreshStats();

    docCountEl.textContent = parsedDocs.length.toString();
    btnRunIndex.disabled = false;
  } catch (e) {
    log(`Error loading QA data: ${e}`);
    btnLoadQA.disabled = false;
  }
});

btnLoadHF.addEventListener('click', async () => {
  btnLoadHF.disabled = true;
  parsedDocs = [];
  
  try {
    log('Fetching HuggingFace Dataset (data/hf_dataset.json)...');
    const res = await fetch('data/hf_dataset.json');
    if (!res.ok) throw new Error('File not found. Please run "python3 download_hf_data.py" first.');
    
    const data = await res.json();
    
    parsedDocs = data.map((item: any) => ({
      text: item.text,
      source: item.metadata?.source || 'HF',
      metadata: item.metadata
    }));
    
    log(`Loaded ${parsedDocs.length} HF documents.`);
    
    // Auto-clear
    await client.sendMessage('CLEAR');
    log('Database cleared for HF test.');
    refreshStats();

    docCountEl.textContent = parsedDocs.length.toString();
    btnRunIndex.disabled = false;
  } catch (e) {
    log(`Error loading HF data: ${e}`);
    btnLoadHF.disabled = false;
  }
});

/* Removed Red Chamber Load Logic */

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
      
      await client.sendMessage('BATCH_ADD', { items: batch });
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
  let queries: string[] = [];
  
  // Detect which dataset is loaded to pick appropriate queries
  if (parsedDocs.length > 0 && parsedDocs[0].source.startsWith('QA-')) {
    queries = [
      "法国首都在哪里？",
      "什么是光合作用？",
      "Python是什么？",
      "谁统一了六国？",
      "东京有什么特点？",
      "Who wrote Harry Potter?",
      "What is the capital of Australia?",
      "What is Blockchain?",
      "Who painted the Mona Lisa?",
      "What is the most popular sport in the world?",
      "What is Sushi?",
      "Who is the 'Poet Sage' of Tang Dynasty?",
      "What is the speed of light?",
      "Who discovered gravity?",
      "What is 5G technology?"
    ];
  } else if (parsedDocs.length > 0 && (parsedDocs[0].source.startsWith('cc100-'))) {
    // Pick some random questions from the loaded dataset itself to ensure hits
    // And some random ones to test misses
    const sampleDocs = parsedDocs.slice(0, 10);
    // Use a longer substring (up to 100 chars) to ensure better semantic overlap with the full document
    queries = sampleDocs.map(d => d.text.substring(0, Math.min(d.text.length, 100))); 
    log(`Selected ${queries.length} queries from the dataset itself for verification.`);
  } else {
    // Fallback: If parsedDocs is empty (e.g. page reload), try to fetch a sample from DB to generate queries
    // This assumes the DB might contain cc100 data or similar
    try {
      const docs: any = await client.sendMessage('GET_ALL');
      if (docs.length > 0) {
        // Pick 10 random docs
        const sampleDocs = docs.sort(() => 0.5 - Math.random()).slice(0, 10);
        queries = sampleDocs.map((d: any) => d.text.substring(0, Math.min(d.text.length, 100)));
        log(`Generated ${queries.length} queries from existing DB documents.`);
      } else {
        queries = ["test query"];
        log("No documents found to generate queries from. Using dummy query.");
      }
    } catch (e) {
      log(`Error fetching docs for query generation: ${e}`);
      queries = ["test"];
    }
  }
  
  log(`Starting search test with ${queries.length} queries... (Brute Force: ${useBruteForceInput.checked})`);
  const startTime = performance.now();
  
  for (const q of queries) {
    const startQ = performance.now();
    const results: any = await client.sendMessage('SEARCH', { query: q, useBruteForce: useBruteForceInput.checked });
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
    await client.sendMessage('CLEAR');
    log('Database cleared.');
    refreshStats();
  }
});

client.init().then(async () => {
  // Check current DB state
  refreshStats();
  
  // Enable search button if docs exist
  try {
    const docs: any = await client.sendMessage('GET_ALL');
    if (docs.length > 0) {
      btnRunSearch.disabled = false;
      log(`Found ${docs.length} existing documents. Search enabled.`);
    }
  } catch (e) {
    console.error(e);
  }
}).catch(e => log(`Init Error: ${e}`));
