const STORAGE_KEY = "myz::highlights";
const SETTINGS_KEY = "myz::settings";
const DEFAULT_STATE = { highlights: {}, order: [] };
const DEFAULT_SETTINGS = {
  logseqEndpoint: "http://127.0.0.1:12315/api/annotations",
  logseqAuthToken: "",
  colorPalette: ["#fde68a", "#fca5a5", "#c4b5fd", "#93c5fd", "#a7f3d0"],
  lastUsedColor: "#fde68a"
};

chrome.runtime.onInstalled.addListener(async () => {
  const { [STORAGE_KEY]: existingHighlights } = await chrome.storage.local.get(STORAGE_KEY);
  if (!existingHighlights) {
    await chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_STATE });
  }
  const { [SETTINGS_KEY]: existingSettings } = await chrome.storage.local.get(SETTINGS_KEY);
  if (!existingSettings) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  const handler = messageHandlers[message.type];
  if (!handler) {
    console.warn("Unhandled message type", message.type);
    return false;
  }

  handler(message.payload, sender)
    .then((result) => sendResponse({ ok: true, data: result }))
    .catch((error) => {
      console.error("Handler error", message.type, error);
      sendResponse({ ok: false, error: error.message || String(error) });
    });

  return true;
});

const messageHandlers = {
  async "myz:getHighlightsForUrl"(payload) {
    const state = await readState();
    const url = payload?.url;
    if (!url) {
      return [];
    }
    return Object.values(state.highlights).filter((item) => item.url === url);
  },

  async "myz:saveHighlight"(payload) {
    if (!payload) {
      throw new Error("Missing highlight payload");
    }
    const state = await readState();
    const now = new Date().toISOString();
    const id = payload.id || generateId();
    const record = {
      ...payload,
      id,
      createdAt: payload.createdAt || now,
      updatedAt: now
    };

    if (!state.highlights[id]) {
      state.order.push(id);
    }
    state.highlights[id] = record;
    await writeState(state);
    await persistColorSelection(record.color);
    return record;
  },

  async "myz:updateHighlight"(payload) {
    if (!payload?.id) {
      throw new Error("Missing highlight id");
    }
    const state = await readState();
    const existing = state.highlights[payload.id];
    if (!existing) {
      throw new Error("Highlight not found");
    }
    const now = new Date().toISOString();
    const updated = { ...existing, ...payload, updatedAt: now };
    state.highlights[payload.id] = updated;
    await writeState(state);
    await persistColorSelection(updated.color);
    return updated;
  },

  async "myz:removeHighlight"(payload) {
    if (!payload?.id) {
      throw new Error("Missing highlight id");
    }
    const state = await readState();
    if (!state.highlights[payload.id]) {
      return { success: true };
    }
    delete state.highlights[payload.id];
    state.order = state.order.filter((item) => item !== payload.id);
    await writeState(state);
    return { success: true };
  },

  async "myz:getAllHighlights"() {
    const state = await readState();
    return sortedHighlights(state);
  },

  async "myz:export"() {
    const state = await readState();
    const highlights = sortedHighlights(state);
    return {
      json: JSON.stringify(highlights, null, 2),
      markdown: buildMarkdownExport(highlights)
    };
  },

  async "myz:getSettings"() {
    return readSettings();
  },

  async "myz:updateSettings"(payload) {
    return writeSettings(payload || {});
  },

  async "myz:updatePalette"(payload) {
    if (!payload) {
      return readSettings();
    }
    return writeSettings(payload);
  },

  async "myz:syncLogseq"(payload) {
    const settings = await readSettings();
    if (!settings.logseqEndpoint) {
      throw new Error("LogSeq endpoint is not configured");
    }
    const state = await readState();
    const highlights = sortedHighlights(state);
    const markdown = buildMarkdownExport(highlights);
    const body = {
      title: payload?.title || `MyZ Annotator Export ${new Date().toISOString()}`,
      format: "markdown",
      content: markdown,
      timestamp: new Date().toISOString()
    };

    const headers = { "Content-Type": "application/json" };
    if (settings.logseqAuthToken) {
      headers.Authorization = settings.logseqAuthToken;
    }

    const response = await fetch(settings.logseqEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LogSeq sync failed: ${response.status} ${text}`);
    }

    return { success: true };
  }
};

async function readState() {
  const { [STORAGE_KEY]: stored } = await chrome.storage.local.get(STORAGE_KEY);
  if (!stored || typeof stored !== "object") {
    return { ...DEFAULT_STATE, order: [] };
  }
  const safeState = {
    highlights: stored.highlights || {},
    order: Array.isArray(stored.order) ? stored.order : []
  };
  const missing = safeState.order.filter((id) => !safeState.highlights[id]);
  if (missing.length) {
    safeState.order = safeState.order.filter((id) => !!safeState.highlights[id]);
  }
  return safeState;
}

async function writeState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

async function readSettings() {
  const { [SETTINGS_KEY]: stored } = await chrome.storage.local.get(SETTINGS_KEY);
  if (!stored) {
    return { ...DEFAULT_SETTINGS };
  }
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function writeSettings(patch) {
  const current = await readSettings();
  const updated = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: updated });
  return updated;
}

async function persistColorSelection(color) {
  if (!color) {
    return;
  }
  const settings = await readSettings();
  if (settings.lastUsedColor === color) {
    return;
  }
  await writeSettings({ lastUsedColor: color });
}

function sortedHighlights(state) {
  return state.order
    .map((id) => state.highlights[id])
    .filter(Boolean)
    .sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
}

function generateId() {
  return `myz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildMarkdownExport(highlights) {
  if (!highlights.length) {
    return "# MyZ Annotator Export\n\n_No highlights available._";
  }
  const grouped = groupByDate(highlights);
  const lines = [];
  lines.push("# MyZ Annotator Export");
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push("");

  for (const [date, items] of grouped) {
    lines.push(`## ${date}`);
    lines.push("");
    items.forEach((item) => {
      const tags = Array.isArray(item.tags) && item.tags.length ? ` #${item.tags.join(" #")}` : "";
      const domain = extractHostname(item.url);
      lines.push(`- **${escapeMarkdown(item.title || domain || "Untitled")}** (${date})${tags}`);
      lines.push(`  - Page: [${escapeMarkdown(domain || item.url)}](${item.url})`);
      if (item.text) {
        lines.push("  - Quote:");
        item.text.split("\n").forEach((line) => {
          lines.push(`    > ${escapeMarkdown(line)}`);
        });
      }
      if (item.note) {
        lines.push("  - Note:");
        item.note.split("\n").forEach((line) => {
          lines.push(`    ${escapeMarkdown(line)}`);
        });
      }
      if (item.color) {
        lines.push(`  - Color: ${item.color}`);
      }
      lines.push("");
    });
  }

  return lines.join("\n");
}

function groupByDate(highlights) {
  const map = new Map();
  highlights.forEach((item) => {
    const date = new Date(item.createdAt || Date.now())
      .toISOString()
      .split("T")[0];
    if (!map.has(date)) {
      map.set(date, []);
    }
    map.get(date).push(item);
  });
  return new Map([...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)));
}

function escapeMarkdown(text) {
  return text.replace(/[\\`*_{}\[\]()#+\-.!|]/g, (match) => `\\${match}`);
}

function extractHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return url;
  }
}
