const STORAGE_KEY = "myz::highlights";
const SETTINGS_KEY = "myz::settings";
const DEFAULT_STATE = { highlights: {}, order: [] };
const DEFAULT_LOGSEQ_ENDPOINT = "http://127.0.0.1:12315/api";
const DEFAULT_LOGSEQ_PAGE = "MyZ Inbox";

const DEFAULT_SETTINGS = {
  logseqEndpoint: "",
  logseqAuthToken: "",
  logseqGraph: "",
  logseqPage: DEFAULT_LOGSEQ_PAGE,
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

  async "myz:getAllTags"() {
    const state = await readState();
    const tags = new Set();
    Object.values(state.highlights).forEach((item) => {
      if (!item || !Array.isArray(item.tags)) {
        return;
      }
      item.tags.forEach((tag) => {
        if (typeof tag !== "string") {
          return;
        }
        const normalized = tag.trim();
        if (!normalized) {
          return;
        }
        tags.add(normalized);
      });
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
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
    if (!settings.logseqSyncEnabled) {
      throw new Error("LogSeq 同步未启用");
    }
    const state = await readState();
    const highlights = sortedHighlights(state);
    const pageName = normalizeLogseqPageName(
      payload?.page || settings.logseqPage || DEFAULT_LOGSEQ_PAGE
    );
    if (!highlights.length) {
      return { success: true, inserted: 0, message: "没有可同步的标注", page: pageName };
    }
    const token = (payload?.token || settings.logseqAuthToken || "").trim();

    const endpoints = buildLogseqEndpointList(settings, payload);
    let lastError = null;
    for (const endpoint of endpoints) {
      if (!endpoint) {
        continue;
      }
      try {
        const pageInfo = await ensureLogseqPage({ endpoint, token, pageName });
        const pageUuid = pageInfo?.uuid;
        if (!pageUuid) {
          throw new Error("无法确定 LogSeq 页面 UUID");
        }

        const exportedAt = new Date();
        const recordsToInsertMap = new Map();
        const recordsWithKnownUuid = [];

        highlights.forEach((record) => {
          if (!record) {
            return;
          }
          if (record.logseqBlockUuid) {
            recordsWithKnownUuid.push(record);
          } else {
            recordsToInsertMap.set(record.id, record);
          }
        });

        for (const record of recordsWithKnownUuid) {
          const uuid = record.logseqBlockUuid;
          if (!uuid) {
            recordsToInsertMap.set(record.id, record);
            continue;
          }
          const existingBlock = await callLogseq({
            endpoint,
            token,
            method: "logseq.Editor.getBlock",
            args: [uuid]
          });
          if (!existingBlock) {
            recordsToInsertMap.set(record.id, record);
          }
        }

        const recordsToInsert = Array.from(recordsToInsertMap.values());
        const payloadEntries = recordsToInsert
          .map((record) => ({
            record,
            block: buildHighlightBlock(record)
          }))
          .filter((entry) => !!entry.block);

        let inserted = 0;
        let stateMutated = false;

        if (payloadEntries.length) {
          const blocksPayload = payloadEntries.map((entry) => entry.block);
          const result = await callLogseq({
            endpoint,
            token,
            method: "logseq.Editor.insertBatchBlock",
            args: [pageUuid, blocksPayload, { sibling: false, before: false }]
          });

          const createdBlocks = extractInsertedBlockEntities(result);
          const blockMatches = await matchInsertedHighlights({
            entries: payloadEntries,
            candidates: createdBlocks,
            pageName,
            endpoint,
            token
          });

          const syncedAt = exportedAt.toISOString();
          blockMatches.forEach((entity, entry) => {
            const blockUuid = extractEntityUuid(entity);
            if (!blockUuid) {
              throw new Error("未能获取新建块的 UUID");
            }
            const current = state.highlights[entry.record.id] || entry.record;
            state.highlights[entry.record.id] = {
              ...current,
              logseqBlockUuid: blockUuid,
              logseqSyncedAt: syncedAt
            };
            inserted += 1;
            stateMutated = true;
          });
        }

        if (stateMutated) {
          await writeState(state);
        }

        if (!settings.logseqEndpoint || normalizeLogseqEndpoint(settings.logseqEndpoint) !== endpoint) {
          await writeSettings({ logseqEndpoint: endpoint });
        }

        return {
          success: true,
          endpoint,
          page: pageName,
          pageUuid,
          inserted,
          total: highlights.length,
          skipped: highlights.length - inserted
        };
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
  const rawCandidates = [payload?.endpoint, settings.logseqEndpoint, DEFAULT_LOGSEQ_ENDPOINT];
  const endpoints = [];
  rawCandidates.forEach((candidate) => {
    const normalized = normalizeLogseqEndpoint(candidate);
    if (normalized && !endpoints.includes(normalized)) {
      endpoints.push(normalized);
    }
  });
  return endpoints;
}

function createLogseqHeaders(token) {
  const headers = { "Content-Type": "application/json" };
  const normalizedToken = typeof token === "string" ? token.trim() : "";
  if (normalizedToken) {
    headers.Authorization = normalizedToken.startsWith("Bearer ")
      ? normalizedToken
      : `Bearer ${normalizedToken}`;
  }
  return headers;
}

async function callLogseq({ endpoint, token, method, args }) {
  if (!endpoint) {
    throw new Error("缺少 LogSeq API 地址");
  }
  if (!method) {
    throw new Error("缺少 LogSeq API 方法名");
  }
  const headers = createLogseqHeaders(token);
  const payload = {
    method,
    args: Array.isArray(args) ? args : typeof args === "undefined" ? [] : [args]
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`LogSeq 请求失败：${response.status} ${text || ""}`.trim());
  }
  return interpretLogseqResponse(text);
}

async function ensureLogseqPage({ endpoint, token, pageName }) {
  const existing = await callLogseq({
    endpoint,
    token,
    method: "logseq.Editor.getPage",
    args: [pageName]
  });
  const existingUuid = extractEntityUuid(existing);
  if (existingUuid) {
    return { entity: existing, uuid: existingUuid };
  }

  const created = await callLogseq({
    endpoint,
    token,
    method: "logseq.Editor.createPage",
    args: [pageName, null, { createFirstBlock: true, redirect: false }]
  });
  const createdUuid = extractEntityUuid(created);
  if (createdUuid) {
    return { entity: created, uuid: createdUuid };
  }

  const fallback = await callLogseq({
    endpoint,
    token,
    method: "logseq.Editor.getPage",
    args: [pageName]
  });
  const fallbackUuid = extractEntityUuid(fallback);
  if (fallbackUuid) {
    return { entity: fallback, uuid: fallbackUuid };
  }

  throw new Error("无法获取 LogSeq 页面 UUID");
}

function extractEntityUuid(entity) {
  if (!entity || typeof entity !== "object") {
    return "";
  }
  if (typeof entity.uuid === "string" && entity.uuid.trim()) {
    return entity.uuid.trim();
  }
  if (entity.page && typeof entity.page === "object") {
    const nestedPage = extractEntityUuid(entity.page);
    if (nestedPage) {
      return nestedPage;
    }
  }
  if (entity.block && typeof entity.block === "object") {
    const nestedBlock = extractEntityUuid(entity.block);
    if (nestedBlock) {
      return nestedBlock;
    }
  }
  if (typeof entity.id === "string" && entity.id.includes("-")) {
    return entity.id.trim();
  }
  return "";
}

function normalizeLogseqEndpoint(value) {
  if (!value) {
    return "";
  }
  let candidate = String(value).trim();
  if (!candidate) {
    return "";
  }
  if (!/^https?:/i.test(candidate)) {
    candidate = `http://${candidate}`;
  }
  try {
    const url = new URL(candidate);
    let path = url.pathname || "";
    if (!path || path === "/") {
      path = "/api";
    } else if (path !== "/api") {
      path = path.startsWith("/api/") ? "/api" : "/api";
    }
    url.pathname = path;
    url.search = "";
    url.hash = "";
    const normalized = url.toString().replace(/\/$/, "");
    return normalized;
  } catch (error) {
    console.warn("Invalid LogSeq endpoint", value, error);
    return "";
  }
}

function normalizeLogseqPageName(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || DEFAULT_LOGSEQ_PAGE;
}

function buildLogseqBlocks(highlights, options = {}) {
  const exportedAt = options.exportedAt instanceof Date ? options.exportedAt : new Date();
  const formattedTime = exportedAt.toLocaleString();
  const headerContent = (options.title || `MyZ 同步 ${formattedTime}`).trim();
  const highlightBlocks = highlights
    .map((record) => buildHighlightBlock(record))
    .filter(Boolean);

  if (!highlightBlocks.length) {
    return [];
  }

  const metadataBlocks = [
    makeBlock(`导出时间: ${formattedTime}`),
    makeBlock(`条目数: ${highlightBlocks.length}`)
  ].filter(Boolean);

  const headerBlock = makeBlock(headerContent, [...metadataBlocks, ...highlightBlocks]);
  if (headerBlock) {
    return [headerBlock];
  }

  return highlightBlocks;
}

function buildHighlightBlock(record) {
  if (!record) {
    return null;
  }
  const link = record.sourceUrl || record.url || "";
  const domain = link ? extractHostname(link) : "";
  const displayTitle = record.title || domain || "Untitled";
  const mainContent = link
    ? `[${cleanLogseqInline(displayTitle)}](${link})`
    : cleanLogseqInline(displayTitle);

  const detailBlocks = [];
  if (link) {
    detailBlocks.push(makeBlock(`页面：[${cleanLogseqInline(domain || link)}](${link})`));
  }
  if (record.id) {
    detailBlocks.push(makeBlock(`ID: ${record.id}`));
  }
  if (record.createdAt) {
    const created = new Date(record.createdAt).toLocaleString();
    detailBlocks.push(makeBlock(`创建时间: ${cleanLogseqInline(created)}`));
  }
  const tags = Array.isArray(record.tags)
    ? record.tags
        .map((tag) => normalizeTagValue(tag))
        .filter(Boolean)
        .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
        .join(" ")
    : "";
  if (tags) {
    detailBlocks.push(makeBlock(`标签: ${tags}`));
  }

  const noteContent = extractRecordNote(record);
  if (noteContent) {
    const combined = makeMarkdownBlock(`批注:\n${noteContent}`);
    if (combined) {
      detailBlocks.push(combined);
    }
  }

  const quoteContent = extractRecordQuote(record);
  if (quoteContent) {
    const combined = makeMarkdownBlock(`摘录:\n${quoteContent}`);
    if (combined) {
      detailBlocks.push(combined);
    }
  }

  return makeBlock(mainContent, detailBlocks.filter(Boolean));
}

function makeBlock(content, children = []) {
  const safeContent = cleanLogseqInline(content);
  if (!safeContent) {
    return null;
  }
  const block = { content: safeContent };
  const childBlocks = Array.isArray(children) ? children.filter(Boolean) : [];
  if (childBlocks.length) {
    block.children = childBlocks;
  }
  return block;
}

function cleanLogseqInline(value) {
  if (!value) {
    return "";
  }
  return String(value).replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim();
}

function cleanLogseqMultiline(value) {
  if (!value) {
    return "";
  }
  const lines = String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .split("\n");

  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }
  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  const normalized = lines.map((line) =>
    line.replace(/\t/g, "  ").replace(/[\v\f]/g, " ").replace(/\s+$/g, "")
  );

  return normalized.join("\n");
}

function makeMarkdownBlock(content) {
  const safeContent = cleanLogseqMultiline(content);
  if (!safeContent) {
    return null;
  }
  return { content: safeContent };
}

function extractRecordQuote(record) {
  const html = record?.html;
  if (html) {
    const markdown = htmlToMarkdown(html || "");
    const cleanedMarkdown = cleanLogseqMultiline(markdown);
    if (cleanedMarkdown) {
      return cleanedMarkdown;
    }
  }

  const rawText = typeof record?.text === "string" ? record.text : "";
  const cleanedText = cleanLogseqMultiline(rawText);
  if (cleanedText) {
    return cleanedText;
  }

  return "";
}

function extractRecordNote(record) {
  const note = typeof record?.note === "string" ? record.note : "";
  if (!note) {
    return "";
  }
  return cleanLogseqMultiline(note);
}

// Flatten various LogSeq API responses into a list of block entities with UUIDs.
function extractInsertedBlockEntities(result) {
  const collected = [];
  collectBlockEntities(result, collected);
  const unique = [];
  const seen = new Set();
  collected.forEach((entity) => {
    const uuid = extractEntityUuid(entity);
    if (!uuid || seen.has(uuid)) {
      return;
    }
    seen.add(uuid);
    unique.push(entity);
  });
  return unique;
}

function collectBlockEntities(node, bucket) {
  if (!bucket || !Array.isArray(bucket)) {
    return;
  }
  if (!node) {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item) => collectBlockEntities(item, bucket));
    return;
  }
  if (typeof node !== "object") {
    return;
  }
  if (typeof node.uuid === "string" && typeof node.content === "string") {
    bucket.push(node);
  }
  if (node.children) {
    collectBlockEntities(node.children, bucket);
  }
  if (node.block) {
    collectBlockEntities(node.block, bucket);
  }
  if (node.blocks) {
    collectBlockEntities(node.blocks, bucket);
  }
  if (node.result) {
    collectBlockEntities(node.result, bucket);
  }
  if (node.vector) {
    collectBlockEntities(node.vector, bucket);
  }
  if (node.data) {
    collectBlockEntities(node.data, bucket);
  }
  if (node.page) {
    collectBlockEntities(node.page, bucket);
  }
}

// Try to align each inserted highlight entry with the created LogSeq block entity.
async function matchInsertedHighlights({ entries, candidates, pageName, endpoint, token }) {
  const matches = new Map();
  const usedUuids = new Set();
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safeCandidates = Array.isArray(candidates) ? candidates : [];

  safeEntries.forEach((entry) => {
    const matched = findMatchingBlock(entry, safeCandidates, usedUuids);
    if (matched) {
      matches.set(entry, matched);
    }
  });

  const remaining = safeEntries.filter((entry) => !matches.has(entry));
  if (remaining.length && endpoint && pageName) {
    try {
      const pageTree = await callLogseq({
        endpoint,
        token,
        method: "logseq.Editor.getPageBlocksTree",
        args: [pageName]
      });
      const pageCandidates = extractInsertedBlockEntities(pageTree);
      remaining.forEach((entry) => {
        const matched = findMatchingBlock(entry, pageCandidates, usedUuids);
        if (matched) {
          matches.set(entry, matched);
        }
      });
    } catch (error) {
      console.warn("读取 LogSeq 页面结构失败", error);
    }
  }

  if (matches.size !== safeEntries.length) {
    throw new Error("无法匹配所有新建的 LogSeq 块");
  }

  return matches;
}

function findMatchingBlock(entry, candidates, usedUuids) {
  const targetContent = cleanLogseqInline(entry?.block?.content || "");
  const idLine = entry?.record?.id ? cleanLogseqInline(`ID: ${entry.record.id}`) : "";
  if (!targetContent) {
    return null;
  }
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const uuid = extractEntityUuid(candidate);
    if (!uuid || (usedUuids && usedUuids.has(uuid))) {
      continue;
    }
    const candidateContent = cleanLogseqInline(candidate.content || "");
    if (candidateContent !== targetContent) {
      continue;
    }
    if (idLine && !blockHasDescendantContent(candidate, idLine)) {
      continue;
    }
    if (usedUuids) {
      usedUuids.add(uuid);
    }
    return candidate;
  }
  return null;
}

function blockHasDescendantContent(block, targetContent) {
  if (!targetContent) {
    return true;
  }
  const queue = Array.isArray(block?.children) ? [...block.children] : [];
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== "object") {
      continue;
    }
    const content = cleanLogseqInline(node.content || "");
    if (content === targetContent) {
      return true;
    }
    if (Array.isArray(node.children) && node.children.length) {
      queue.push(...node.children);
    }
  }
  return false;
}

function interpretLogseqResponse(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) {
    return null;
  }
  if (trimmed.toLowerCase() === "ok") {
    return "ok";
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`LogSeq API 响应无法解析：${trimmed}`);
  }

  if (parsed && typeof parsed === "object") {
    if ("error" in parsed && parsed.error) {
      const message = typeof parsed.error === "string"
        ? parsed.error
        : parsed.error.message || JSON.stringify(parsed.error);
      const err = new Error(message);
      if (parsed.error.code) {
        err.code = parsed.error.code;
      }
      throw err;
    }
    if ("result" in parsed) {
      return parsed.result;
    }
  }

  return parsed;
}

function normalizeTagValue(tag) {
  return typeof tag === "string" ? tag.trim() : "";
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
