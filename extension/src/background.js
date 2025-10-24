const STORAGE_KEY = "myz::highlights";
const SETTINGS_KEY = "myz::settings";
const DEFAULT_STATE = { highlights: {}, order: [] };
const LOGSEQ_ENDPOINT_CANDIDATES = [
  "http://127.0.0.1:12315/api/logseq/markup/import",
  "http://127.0.0.1:12315/api/logseq/page",
  "http://127.0.0.1:12315/api/annotations"
];

const DEFAULT_SETTINGS = {
  logseqEndpoint: "",
  logseqAuthToken: "",
  logseqGraph: "",
  logseqSyncEnabled: false,
  colorPalette: ["#fde68a", "#fca5a5", "#c4b5fd", "#93c5fd", "#a7f3d0"],
  lastUsedColor: "#fde68a",
  dashboardView: "cards"
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
    const state = await readState();
    const highlights = sortedHighlights(state);
    const markdown = buildMarkdownExport(highlights);
    const body = {
      title: payload?.title || `MyZ Annotator Export ${new Date().toISOString()}`,
      format: "markdown",
      content: markdown,
      timestamp: new Date().toISOString(),
      graph: settings.logseqGraph || ""
    };

    const headers = { "Content-Type": "application/json" };
    if (settings.logseqAuthToken) {
      headers.Authorization = settings.logseqAuthToken;
    }

    const endpoints = buildLogseqEndpointList(settings, payload);
    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          const text = await response.text();
          if (response.status === 404 || response.status === 405) {
            lastError = new Error(`LogSeq sync failed: ${response.status} ${text}`);
            continue;
          }
          throw new Error(`LogSeq sync failed: ${response.status} ${text}`);
        }
        if (!settings.logseqEndpoint || settings.logseqEndpoint !== endpoint) {
          await writeSettings({ logseqEndpoint: endpoint });
        }
        return { success: true, endpoint };
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error("LogSeq sync failed: no endpoint responded");
  },

  async "myz:captureSelection"(payload, sender) {
    if (!sender?.tab || typeof sender.tab.windowId === "undefined") {
      throw new Error("No active tab for capture");
    }
    const format = payload?.format === "jpeg" ? "jpeg" : "png";
    const quality = typeof payload?.quality === "number" ? payload.quality : undefined;
    const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
      format,
      quality
    });
    return { dataUrl };
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
      const quoteMarkdown = htmlToMarkdown(item.html || "");
      if (quoteMarkdown) {
        lines.push("  - Quote:");
        quoteMarkdown.split("\n").forEach((line) => {
          lines.push(`    ${line.startsWith(">") ? line : `> ${line}`}`.trimEnd());
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

function buildLogseqEndpointList(settings, payload) {
  const endpoints = [];
  if (payload?.endpoint) {
    endpoints.push(payload.endpoint);
  }
  if (settings.logseqEndpoint) {
    endpoints.push(settings.logseqEndpoint);
  }
  LOGSEQ_ENDPOINT_CANDIDATES.forEach((candidate) => {
    if (!endpoints.includes(candidate)) {
      endpoints.push(candidate);
    }
  });
  return endpoints;
}

function htmlToMarkdown(html) {
  if (!html) {
    return "";
  }
  try {
    if (typeof DOMParser !== "undefined") {
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
      const container = doc.body.firstElementChild;
      if (!container) {
        return "";
      }
      return normalizeMarkdown(serializeNodes(Array.from(container.childNodes))).trim();
    }
  } catch (error) {
    console.warn("Failed to convert HTML to markdown", error);
  }
  return normalizeMarkdown(fallbackHtmlToMarkdown(html));
}

function serializeNodes(nodes, context = {}) {
  return nodes
    .map((node, index) => nodeToMarkdown(node, { ...context, index }))
    .join("");
}

function nodeToMarkdown(node, context) {
  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  if (node.nodeType === TEXT_NODE) {
    return node.textContent || "";
  }
  if (node.nodeType !== ELEMENT_NODE) {
    return "";
  }
  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes);
  switch (tag) {
    case "br":
      return "\n";
    case "strong":
    case "b":
      return `**${serializeNodes(children, context).trim()}**`;
    case "em":
    case "i":
      return `*${serializeNodes(children, context).trim()}*`;
    case "code":
      return `\`${serializeNodes(children, context).trim()}\``;
    case "pre": {
      const code = serializeNodes(children, context).replace(/\n+$/g, "");
      return `\n\n\`\`\`\n${code}\n\`\`\`\n\n`;
    }
    case "a": {
      const href = node.getAttribute("href") || "";
      const label = serializeNodes(children, context).trim() || href;
      return `[${label}](${href})`;
    }
    case "mark":
      return `==${serializeNodes(children, context)}==`;
    case "blockquote": {
      const quote = serializeNodes(children, context)
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
      return `\n${quote}\n`;
    }
    case "ul":
      return "\n" + Array.from(node.children)
        .map((child) => `- ${serializeNodes(Array.from(child.childNodes), context).trim()}`)
        .join("\n") + "\n";
    case "ol":
      return "\n" + Array.from(node.children)
        .map((child, idx) => `${idx + 1}. ${serializeNodes(Array.from(child.childNodes), context).trim()}`)
        .join("\n") + "\n";
    case "li":
      return serializeNodes(children, context).trim();
    case "p":
    case "div":
      return `\n\n${serializeNodes(children, context).trim()}\n\n`;
    case "span":
    case "u":
    case "small":
      return serializeNodes(children, context);
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const level = parseInt(tag.slice(1), 10);
      return `\n\n${"#".repeat(level)} ${serializeNodes(children, context).trim()}\n\n`;
    }
    default:
      return serializeNodes(children, context);
  }
}

function normalizeMarkdown(markdown) {
  return markdown.replace(/\n{3,}/g, "\n\n").trim();
}

function fallbackHtmlToMarkdown(html) {
  let output = html;
  output = output.replace(/\s*<br\s*\/?>\s*/gi, "\n");
  output = output.replace(/<\/?p[^>]*>/gi, "\n\n");
  output = output.replace(/<\/?div[^>]*>/gi, "\n\n");
  output = output.replace(/<\/?blockquote[^>]*>/gi, (match) => (match.startsWith("</") ? "\n" : "\n> "));
  output = output.replace(/<li[^>]*>/gi, "\n- ");
  output = output.replace(/<\/?ul[^>]*>/gi, "\n");
  output = output.replace(/<ol[^>]*>/gi, "\n");
  output = output.replace(/<\/?ol[^>]*>/gi, "\n");
  output = output.replace(/<strong[^>]*>|<b[^>]*>/gi, "**");
  output = output.replace(/<\/strong>|<\/b>/gi, "**");
  output = output.replace(/<em[^>]*>|<i[^>]*>/gi, "*");
  output = output.replace(/<\/em>|<\/i>/gi, "*");
  output = output.replace(/<code[^>]*>/gi, "`");
  output = output.replace(/<\/code>/gi, "`");
  output = output.replace(/<pre[^>]*>/gi, "\n\n```");
  output = output.replace(/<\/pre>/gi, "```\n\n");
  output = output.replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  output = output.replace(/<mark[^>]*>(.*?)<\/mark>/gi, "==$1==");
  output = output.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (match, level, text) => `\n\n${"#".repeat(Number(level))} ${text}\n\n`);
  output = output.replace(/<table[^>]*>|<\/table>|<thead[^>]*>|<\/thead>|<tbody[^>]*>|<\/tbody>/gi, "\n");
  output = output.replace(/<tr[^>]*>/gi, "\n");
  output = output.replace(/<\/tr>/gi, "\n");
  output = output.replace(/<t[dh][^>]*>/gi, " | ");
  output = output.replace(/<\/t[dh]>/gi, " ");
  output = output.replace(/<[^>]+>/g, "");
  return output;
}
