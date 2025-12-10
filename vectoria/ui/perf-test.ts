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

// Config Elements
const embedderTypeEl = document.getElementById('embedderType') as HTMLSelectElement;

// Local Config Elements
const localConfigEl = document.getElementById('localConfig') as HTMLDivElement;
const localModelSelectEl = document.getElementById('localModelSelect') as HTMLSelectElement;
const customLocalModelContainerEl = document.getElementById('customLocalModelContainer') as HTMLDivElement;
const customLocalModelEl = document.getElementById('customLocalModel') as HTMLInputElement;

// OpenAI Config Elements
const openaiConfigEl = document.getElementById('openaiConfig') as HTMLDivElement;
const openaiKeyEl = document.getElementById('openaiKey') as HTMLInputElement;
const openaiEndpointEl = document.getElementById('openaiEndpoint') as HTMLInputElement;
const openaiModelEl = document.getElementById('openaiModel') as HTMLInputElement;
const btnSaveConfig = document.getElementById('btnSaveConfig') as HTMLButtonElement;

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

// Load saved config
const savedOpenAIConfig = localStorage.getItem('vectoria_openai_config');
const savedLocalConfig = localStorage.getItem('vectoria_local_config');
const savedType = localStorage.getItem('vectoria_type');

if (savedType) {
  embedderTypeEl.value = savedType;
}

// Set initial visibility based on loaded type (or default)
updateVisibility();

if (savedOpenAIConfig) {
  try {
    const config = JSON.parse(savedOpenAIConfig);
    if (config.apiKey) openaiKeyEl.value = config.apiKey;
    if (config.endpoint) openaiEndpointEl.value = config.endpoint;
    if (config.modelName) openaiModelEl.value = config.modelName;
  } catch (e) {
    console.error('Failed to parse saved OpenAI config', e);
  }
}

if (savedLocalConfig) {
  try {
    const config = JSON.parse(savedLocalConfig);
    if (config.modelName) {
      // Check if model is in select options
      const optionExists = Array.from(localModelSelectEl.options).some(opt => opt.value === config.modelName);
      if (optionExists) {
        localModelSelectEl.value = config.modelName;
      } else {
        localModelSelectEl.value = 'custom';
        customLocalModelEl.value = config.modelName;
        customLocalModelContainerEl.style.display = 'block';
      }
    }
  } catch (e) {
    console.error('Failed to parse saved Local config', e);
  }
}

// Config Logic
embedderTypeEl.addEventListener('change', () => {
  updateVisibility();
});

localModelSelectEl.addEventListener('change', () => {
  if (localModelSelectEl.value === 'custom') {
    customLocalModelContainerEl.style.display = 'block';
  } else {
    customLocalModelContainerEl.style.display = 'none';
  }
});

btnSaveConfig.addEventListener('click', () => {
  updateConfig(true);
});

function updateVisibility() {
  const isOpenAI = embedderTypeEl.value === 'openai';
  openaiConfigEl.style.display = isOpenAI ? 'block' : 'none';
  localConfigEl.style.display = isOpenAI ? 'none' : 'block';
}

function updateConfig(showFeedback = false) {
  const localModelName = localModelSelectEl.value === 'custom' 
    ? customLocalModelEl.value 
    : localModelSelectEl.value;

  const config = {
    type: embedderTypeEl.value,
    local: {
      modelName: localModelName
    },
    openai: {
      apiKey: openaiKeyEl.value,
      endpoint: openaiEndpointEl.value,
      modelName: openaiModelEl.value
    }
  };

  localStorage.setItem('vectoria_type', config.type);
  localStorage.setItem('vectoria_openai_config', JSON.stringify(config.openai));
  localStorage.setItem('vectoria_local_config', JSON.stringify(config.local));
  
  // Only send if client is ready, otherwise just return config
  if (client) {
     const originalText = btnSaveConfig.textContent;
     if (showFeedback) {
       btnSaveConfig.textContent = 'Saving...';
       btnSaveConfig.disabled = true;
     }

     client.sendMessage('CONFIGURE', config).then(() => {
       console.log('Configuration updated');
       if (showFeedback) {
         statusEl.textContent = 'Configuration saved and applied.';
         btnSaveConfig.textContent = 'Saved!';
         setTimeout(() => {
           btnSaveConfig.textContent = originalText;
           btnSaveConfig.disabled = false;
         }, 2000);
       }
     }).catch(err => {
       console.error('Config update failed', err);
       if (showFeedback) {
         statusEl.textContent = 'Error saving configuration: ' + err.message;
         btnSaveConfig.textContent = 'Error';
         setTimeout(() => {
           btnSaveConfig.textContent = originalText;
           btnSaveConfig.disabled = false;
         }, 2000);
       }
     });
  }
  
  // We return the config object so migration can use it
  return config;
}

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
