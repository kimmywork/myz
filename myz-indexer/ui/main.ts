import { IndexerClient } from './client';

// UI Logic
const statusEl = document.getElementById('status')!;
const docTextEl = document.getElementById('docText') as HTMLTextAreaElement;
const queryInputEl = document.getElementById('queryInput') as HTMLInputElement;
const resultsEl = document.getElementById('results')!;
const docListEl = document.getElementById('docList')!;

// Config Elements
const embedderTypeEl = document.getElementById('embedderType') as HTMLSelectElement;
const openaiConfigEl = document.getElementById('openaiConfig') as HTMLDivElement;
const openaiKeyEl = document.getElementById('openaiKey') as HTMLInputElement;
const openaiEndpointEl = document.getElementById('openaiEndpoint') as HTMLInputElement;
const openaiModelEl = document.getElementById('openaiModel') as HTMLInputElement;

// Migration Elements
const btnMigrate = document.getElementById('btnMigrate') as HTMLButtonElement;
const btnStopMigrate = document.getElementById('btnStopMigrate') as HTMLButtonElement;
const migrationStatusEl = document.getElementById('migrationStatus') as HTMLDivElement;

const client = new IndexerClient((msg) => {
  statusEl.textContent = msg;
});

let migrationPollInterval: any = null;

// Load saved config
const savedOpenAIConfig = localStorage.getItem('myz_indexer_openai_config');
const savedType = localStorage.getItem('myz_indexer_type');

if (savedType) {
  embedderTypeEl.value = savedType;
}

// Set initial visibility based on loaded type (or default)
openaiConfigEl.style.display = embedderTypeEl.value === 'openai' ? 'block' : 'none';

if (savedOpenAIConfig) {
  try {
    const config = JSON.parse(savedOpenAIConfig);
    if (config.apiKey) openaiKeyEl.value = config.apiKey;
    if (config.endpoint) openaiEndpointEl.value = config.endpoint;
    if (config.modelName) openaiModelEl.value = config.modelName;
  } catch (e) {
    console.error('Failed to parse saved config', e);
  }
}

// Config Logic
embedderTypeEl.addEventListener('change', () => {
  openaiConfigEl.style.display = embedderTypeEl.value === 'openai' ? 'block' : 'none';
  updateConfig();
});

[openaiKeyEl, openaiEndpointEl, openaiModelEl].forEach(el => {
  el.addEventListener('change', () => updateConfig());
});

function updateConfig() {
  const config = {
    type: embedderTypeEl.value,
    openai: {
      apiKey: openaiKeyEl.value,
      endpoint: openaiEndpointEl.value,
      modelName: openaiModelEl.value
    }
  };

  localStorage.setItem('myz_indexer_type', config.type);
  localStorage.setItem('myz_indexer_openai_config', JSON.stringify(config.openai));
  
  // Only send if client is ready, otherwise just return config
  if (client) {
     client.sendMessage('CONFIGURE', config).then(() => {
       console.log('Configuration updated');
     }).catch(err => {
       console.error('Config update failed', err);
     });
  }
  
  // We return the config object so migration can use it
  return config;
}

// Migration Logic
btnMigrate.addEventListener('click', async () => {
  const config = updateConfig(); // Get current config
  if (!config) return;
  
  if (config.type === 'openai' && !config.openai.apiKey) {
    alert('Please enter OpenAI API Key');
    return;
  }

  try {
    await client.sendMessage('MIGRATE_START', { target: config });
    btnMigrate.disabled = true;
    btnStopMigrate.disabled = false;
    startMigrationPolling();
  } catch (e) {
    console.error(e);
    alert('Migration failed to start: ' + e);
  }
});

btnStopMigrate.addEventListener('click', async () => {
  try {
    await client.sendMessage('MIGRATE_STOP');
    stopMigrationPolling();
    btnMigrate.disabled = false;
    btnStopMigrate.disabled = true;
    migrationStatusEl.textContent = 'Migration stopped by user.';
  } catch (e) {
    console.error(e);
  }
});

function startMigrationPolling() {
  if (migrationPollInterval) clearInterval(migrationPollInterval);
  migrationPollInterval = setInterval(async () => {
    try {
      const status: any = await client.sendMessage('MIGRATE_STATUS');
      if (status.status === 'not_started') return;
      
      migrationStatusEl.textContent = `Processed: ${status.processed} / ${status.total} (${((status.processed/status.total)*100).toFixed(1)}%)`;
      
      if (status.isComplete) {
        stopMigrationPolling();
        btnMigrate.disabled = false;
        btnStopMigrate.disabled = true;
        migrationStatusEl.textContent += ' - Complete!';
        
        // Also update the active configuration to match the migration target
        client.sendMessage('CONFIGURE', updateConfig());
      }
      
      if (status.error) {
        stopMigrationPolling();
        btnMigrate.disabled = false;
        btnStopMigrate.disabled = true;
        migrationStatusEl.textContent += ` - Error: ${status.error}`;
      }
    } catch (e) {
      console.error(e);
    }
  }, 1000);
}

function stopMigrationPolling() {
  if (migrationPollInterval) {
    clearInterval(migrationPollInterval);
    migrationPollInterval = null;
  }
}

document.getElementById('btnAdd')?.addEventListener('click', async () => {
  const text = docTextEl.value;
  if (!text) return;
  statusEl.textContent = 'Indexing... (Model might be downloading)';
  try {
    await client.sendMessage('ADD_DOC', { text });
    statusEl.textContent = 'Document indexed.';
    docTextEl.value = '';
    refreshList();
  } catch (e) {
    statusEl.textContent = `Error: ${e}`;
  }
});

document.getElementById('btnSearch')?.addEventListener('click', async () => {
  const query = queryInputEl.value;
  const useBruteForce = (document.getElementById('useBruteForce') as HTMLInputElement).checked;
  if (!query) return;
  statusEl.textContent = 'Searching...';
  try {
    const results: any = await client.sendMessage('SEARCH', { query, useBruteForce });
    statusEl.textContent = `Found ${results.length} results.`;
    resultsEl.innerHTML = results.map((r: any) => `
      <div style="margin-top: 10px; padding: 5px; background: #e9ecef;">
        <strong>Score: ${r.score.toFixed(4)}</strong><br>
        ${r.text}
      </div>
    `).join('');
  } catch (e) {
    statusEl.textContent = `Error: ${e}`;
  }
});

document.getElementById('btnList')?.addEventListener('click', refreshList);
document.getElementById('btnClear')?.addEventListener('click', async () => {
    if(confirm('Clear all data?')) {
        await client.sendMessage('CLEAR');
        refreshList();
    }
});

async function refreshList() {
  try {
    const docs: any = await client.sendMessage('GET_ALL');
    docListEl.textContent = JSON.stringify(docs, null, 2);
  } catch (e) {
    console.error(e);
  }
}

client.init().then(() => {
  updateConfig();
}).catch(console.error);
