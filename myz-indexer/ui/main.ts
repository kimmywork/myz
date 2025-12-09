// UI Logic
const statusEl = document.getElementById('status')!;
const docTextEl = document.getElementById('docText') as HTMLTextAreaElement;
const queryInputEl = document.getElementById('queryInput') as HTMLInputElement;
const resultsEl = document.getElementById('results')!;
const docListEl = document.getElementById('docList')!;

let sw: ServiceWorker | null = null;

async function init() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/ui/sw.ts', {
        type: 'module', // Important for Vite + TS
        scope: '/'
      });
      
      // Wait for the service worker to be active
      if (registration.installing) {
        statusEl.textContent = 'Service Worker installing...';
      } else if (registration.waiting) {
        statusEl.textContent = 'Service Worker installed.';
      } else if (registration.active) {
        statusEl.textContent = 'Service Worker active.';
        sw = registration.active;
      }

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        sw = navigator.serviceWorker.controller;
        statusEl.textContent = 'Service Worker controller changed & ready.';
      });

      navigator.serviceWorker.ready.then((reg) => {
        sw = reg.active;
        statusEl.textContent = 'Service Worker Ready!';
      });

      // Listen for messages from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('Message from SW:', event.data);
      });

    } catch (error) {
      statusEl.textContent = `SW Registration failed: ${error}`;
      console.error(error);
    }
  } else {
    statusEl.textContent = 'Service Worker not supported.';
  }
}

function sendMessage(type: string, payload: any = {}) {
  return new Promise((resolve, reject) => {
    if (!sw) {
      reject('No Service Worker active');
      return;
    }
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      if (event.data.error) {
        reject(event.data.error);
      } else {
        resolve(event.data.result);
      }
    };
    sw.postMessage({ type, payload }, [channel.port2]);
  });
}

document.getElementById('btnAdd')?.addEventListener('click', async () => {
  const text = docTextEl.value;
  if (!text) return;
  statusEl.textContent = 'Indexing... (Model might be downloading)';
  try {
    await sendMessage('ADD_DOC', { text });
    statusEl.textContent = 'Document indexed.';
    docTextEl.value = '';
    refreshList();
  } catch (e) {
    statusEl.textContent = `Error: ${e}`;
  }
});

document.getElementById('btnSearch')?.addEventListener('click', async () => {
  const query = queryInputEl.value;
  if (!query) return;
  statusEl.textContent = 'Searching...';
  try {
    const results: any = await sendMessage('SEARCH', { query });
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
        await sendMessage('CLEAR');
        refreshList();
    }
});

async function refreshList() {
  try {
    const docs: any = await sendMessage('GET_ALL');
    docListEl.textContent = JSON.stringify(docs, null, 2);
  } catch (e) {
    console.error(e);
  }
}

init();
