import { IndexerClient } from './client';
import { populateModelSelect } from './utils';

// UI Logic
const statusEl = document.getElementById('status')!;
const docTextEl = document.getElementById('docText') as HTMLTextAreaElement;
const queryInputEl = document.getElementById('queryInput') as HTMLInputElement;
const resultsEl = document.getElementById('results')!;
const totalDocsEl = document.getElementById('totalDocs')!;
// const indexSizeEl = document.getElementById('indexSize')!;

// Config Elements
const embedderTypeEl = document.getElementById('embedderType') as HTMLSelectElement;

// Local Config Elements
const localConfigEl = document.getElementById('localConfig') as HTMLDivElement;
const localModelSelectEl = document.getElementById('localModelSelect') as HTMLSelectElement;
const customLocalModelContainerEl = document.getElementById('customLocalModelContainer') as HTMLDivElement;
const customLocalModelEl = document.getElementById('customLocalModel') as HTMLInputElement;

// Populate model select
populateModelSelect(localModelSelectEl);

// OpenAI Config Elements
const openaiConfigEl = document.getElementById('openaiConfig') as HTMLDivElement;
const openaiKeyEl = document.getElementById('openaiKey') as HTMLInputElement;
const openaiEndpointEl = document.getElementById('openaiEndpoint') as HTMLInputElement;
const openaiModelEl = document.getElementById('openaiModel') as HTMLInputElement;
const btnSaveConfig = document.getElementById('btnSaveConfig') as HTMLButtonElement;

// Migration Elements
const btnMigrate = document.getElementById('btnMigrate') as HTMLButtonElement;
const btnStopMigrate = document.getElementById('btnStopMigrate') as HTMLButtonElement;
const migrationStatusEl = document.getElementById('migrationStatus') as HTMLDivElement;

const client = new IndexerClient((msg) => {
  statusEl.textContent = msg;
});

let migrationPollInterval: any = null;

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
  
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length === 0) return;

  statusEl.textContent = `Indexing ${lines.length} documents... (Model might be downloading)`;
  try {
    // Add documents sequentially or in parallel depending on needs. 
    // Here we just loop for simplicity, or we could add a batch API later.
    for (const line of lines) {
        await client.sendMessage('ADD_DOC', { text: line });
    }
    statusEl.textContent = `${lines.length} documents indexed.`;
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
    totalDocsEl.textContent = docs.length.toString();
    // indexSizeEl.textContent = 'Calculated on save'; // Placeholder
  } catch (e) {
    console.error(e);
  }
}

client.init().then(() => {
  updateConfig();
}).catch(console.error);
