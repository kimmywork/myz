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
  lastUsedStyle: "paint",
  dashboardView: "cards"
};

const HIGHLIGHT_STYLES = {
  PAINT: "paint",
  UNDERLINE: "underline",
  WAVY: "wavy"
};

const DEFAULT_HIGHLIGHT_STYLE = HIGHLIGHT_STYLES.PAINT;

function normalizeHighlightStyle(style) {
  if (!style) {
    return DEFAULT_HIGHLIGHT_STYLE;
  }
  const value = String(style).toLowerCase();
  if (value === HIGHLIGHT_STYLES.UNDERLINE) {
    return HIGHLIGHT_STYLES.UNDERLINE;
  }
  if (value === HIGHLIGHT_STYLES.WAVY) {
    return HIGHLIGHT_STYLES.WAVY;
  }
  return DEFAULT_HIGHLIGHT_STYLE;
}

function describeHighlightStyle(style) {
  const normalized = normalizeHighlightStyle(style);
  if (normalized === HIGHLIGHT_STYLES.UNDERLINE) {
    return "下划线";
  }
  if (normalized === HIGHLIGHT_STYLES.WAVY) {
    return "波浪线";
  }
  return "高亮";
}

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
    const kind = payload.kind === "clip" ? "clip" : "highlight";
    const record = {
      ...payload,
      id,
      kind,
      createdAt: payload.createdAt || now,
      updatedAt: now
    };

    if (kind === "clip") {
      record.range = null;
      record.color = null;
      record.style = null;
    } else {
      record.style = normalizeHighlightStyle(payload.style);
    }

    if (!state.highlights[id]) {
      state.order.push(id);
    }
    state.highlights[id] = record;
    await writeState(state);
    if (kind === "highlight") {
      await persistHighlightPreferences({ color: record.color, style: record.style });
    }
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
    const requestedKind =
      payload.kind === "clip"
        ? "clip"
        : payload.kind === "highlight"
        ? "highlight"
        : existing.kind === "clip"
        ? "clip"
        : "highlight";
    const updated = { ...existing, ...payload, kind: requestedKind, updatedAt: now };
    if (updated.kind === "clip") {
      updated.range = null;
      updated.color = null;
      updated.style = null;
    } else {
      updated.style = normalizeHighlightStyle(updated.style);
    }
    state.highlights[payload.id] = updated;
    await writeState(state);
    if (updated.kind === "highlight") {
      await persistHighlightPreferences({ color: updated.color, style: updated.style });
    }
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

  async "myz:updateBadge"(payload, sender) {
    const tabId = typeof payload?.tabId === "number" ? payload.tabId : sender?.tab?.id;
    if (typeof tabId !== "number" || Number.isNaN(tabId)) {
      return { success: false };
    }
    const { total, highlightCount, savedCount } = normalizeBadgeCounts(payload);
    const text = total > 0 ? (total > 99 ? "99+" : String(total)) : "";
    await chrome.action.setBadgeText({ tabId, text });
    if (text) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: [37, 99, 235, 255] });
      if (typeof chrome.action.setBadgeTextColor === "function") {
        await chrome.action.setBadgeTextColor({ tabId, color: [255, 255, 255, 255] });
      }
    }
    const title = buildActionTitle({ total, highlightCount, savedCount });
    try {
      await chrome.action.setTitle({ tabId, title });
    } catch (error) {
      console.warn("Failed to update action title", error);
    }
    return { success: true };
  },

  async "myz:importHighlights"(payload) {
    const records = Array.isArray(payload?.records) ? payload.records : [];
    if (!records.length) {
      throw new Error("没有可导入的数据");
    }

    const strategy = normalizeImportStrategy(payload?.strategy);
    const state = await readState();
    const existingHighlights = state.highlights || {};
    const usedIds = new Set(Object.keys(existingHighlights));

    const existingSignatures = new Set();
    Object.values(existingHighlights).forEach((record) => {
      const signature = buildHighlightSignature(record);
      if (signature) {
        existingSignatures.add(signature);
      }
    });

    const replacements = new Map();
    const additions = new Map();
    let skipped = 0;

    records.forEach((raw) => {
      const sanitized = sanitizeImportedHighlight(raw);
      if (!sanitized) {
        skipped += 1;
        return;
      }

      let identifier = typeof sanitized.id === "string" ? sanitized.id.trim() : "";

      // Handle conflicts with existing highlights first.
      if (identifier && existingHighlights[identifier] && !replacements.has(identifier)) {
        const existingRecord = existingHighlights[identifier];
        if (!resolveImportConflict(strategy, existingRecord, sanitized)) {
          skipped += 1;
          return;
        }
        sanitized.id = identifier;
        applyTimestampFallback(sanitized, existingRecord);
        const signature = buildHighlightSignature(sanitized);
        if (signature) {
          existingSignatures.add(signature);
        }
        replacements.set(identifier, sanitized);
        return;
      }

      // Conflicts with already staged replacements or additions (duplicate IDs within payload).
      if (identifier && (replacements.has(identifier) || additions.has(identifier))) {
        const staged = replacements.get(identifier) || additions.get(identifier);
        if (!resolveImportConflict(strategy, staged, sanitized)) {
          skipped += 1;
          return;
        }
        sanitized.id = identifier;
        applyTimestampFallback(sanitized, staged);
        const signature = buildHighlightSignature(sanitized);
        if (signature) {
          existingSignatures.add(signature);
        }
        if (replacements.has(identifier)) {
          replacements.set(identifier, sanitized);
        } else {
          additions.set(identifier, sanitized);
        }
        return;
      }

      // De-duplicate by selection signature to avoid creating multiple identical highlights.
      const signature = buildHighlightSignature(sanitized);
      if (signature && existingSignatures.has(signature)) {
        skipped += 1;
        return;
      }

      let resolvedId = identifier;
      if (!resolvedId || usedIds.has(resolvedId) || additions.has(resolvedId)) {
        resolvedId = generateUniqueImportId(usedIds);
      } else {
        usedIds.add(resolvedId);
      }
      sanitized.id = resolvedId;
      applyTimestampFallback(sanitized);
      sanitized.updatedAt = sanitized.updatedAt || sanitized.createdAt;
      if (signature) {
        existingSignatures.add(signature);
      }
      additions.set(resolvedId, sanitized);
    });

    if (!additions.size && !replacements.size && skipped === 0) {
      throw new Error("没有符合要求的标注");
    }

    replacements.forEach((record, id) => {
      state.highlights[id] = record;
      state.order.push(id);
    });

    additions.forEach((record, id) => {
      state.highlights[id] = record;
      state.order.push(id);
    });

    state.order = dedupeOrder(state.order, state.highlights);

    await writeState(state);
    return {
      inserted: additions.size,
      replaced: replacements.size,
      skipped
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
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  merged.lastUsedStyle = normalizeHighlightStyle(merged.lastUsedStyle);
  return merged;
}

async function writeSettings(patch) {
  const current = await readSettings();
  const updated = { ...current, ...patch };
  updated.lastUsedStyle = normalizeHighlightStyle(updated.lastUsedStyle);
  await chrome.storage.local.set({ [SETTINGS_KEY]: updated });
  return updated;
}

async function persistHighlightPreferences({ color, style } = {}) {
  const patch = {};
  const settings = await readSettings();

  if (typeof color === "string" && color.trim()) {
    const normalizedColor = color.trim();
    if (settings.lastUsedColor !== normalizedColor) {
      patch.lastUsedColor = normalizedColor;
    }
  }

  if (style) {
    const normalizedStyle = normalizeHighlightStyle(style);
    if (settings.lastUsedStyle !== normalizedStyle) {
      patch.lastUsedStyle = normalizedStyle;
    }
  }

  if (Object.keys(patch).length) {
    await writeSettings(patch);
  }
}

function normalizeBadgeCounts(payload = {}) {
  const highlightFromPayload = coerceBadgeCount(payload.highlightCount);
  const savedFromPayload = coerceBadgeCount(payload.savedCount);
  const totalFromPayload = coerceBadgeCount(payload.total);
  const legacyCount = coerceBadgeCount(payload.count);

  const highlightCount = highlightFromPayload ?? (legacyCount !== null ? legacyCount : 0);
  const savedCount = savedFromPayload ?? 0;

  let total = totalFromPayload;
  if (total === null) {
    if (highlightFromPayload !== null || savedFromPayload !== null) {
      total = (highlightFromPayload ?? 0) + (savedFromPayload ?? 0);
    } else if (legacyCount !== null) {
      total = legacyCount;
    } else {
      total = 0;
    }
  }

  return {
    highlightCount: Math.max(0, highlightCount ?? 0),
    savedCount: Math.max(0, savedCount ?? 0),
    total: Math.max(0, total ?? 0)
  };
}

function coerceBadgeCount(value) {
  if (typeof value !== "number") {
    return null;
  }
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function buildActionTitle({ total, highlightCount, savedCount }) {
  const base = "MyZ Annotator";
  if (!total) {
    return `${base} · 暂无条目`;
  }
  const detailParts = [];
  if (highlightCount) {
    detailParts.push(`高亮 ${highlightCount}`);
  }
  if (savedCount) {
    detailParts.push(`保存 ${savedCount}`);
  }
  const detail = detailParts.length ? `（${detailParts.join(" · ")}）` : "";
  return `${base} · 共 ${total} 条${detail}`;
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

function generateUniqueImportId(usedIds) {
  let candidate = generateId();
  while (usedIds.has(candidate)) {
    candidate = generateId();
  }
  usedIds.add(candidate);
  return candidate;
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
      if (item.kind === "highlight") {
        lines.push(`  - Style: ${describeHighlightStyle(item.style)}`);
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

  if (record.kind === "highlight") {
    detailBlocks.push(makeBlock(`样式: ${describeHighlightStyle(record.style)}`));
  }

  const noteContent = extractRecordNote(record);
  if (noteContent) {
    const noteBlocks = makeMarkdownBlock(noteContent);
    if (noteBlocks?.length) {
      detailBlocks.push(makeBlock("批注", noteBlocks));
    }
  }

  const quoteContent = extractRecordQuote(record);
  if (quoteContent) {
    const quoteBlocks = makeMarkdownBlock(quoteContent);
    if (quoteBlocks?.length) {
      detailBlocks.push(makeBlock("摘录", quoteBlocks));
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
    return [];
  }

  const root = {
    level: -1,
    indent: -1,
    type: "root",
    lines: [],
    children: []
  };
  const stack = [root];
  let currentParagraph = null;
  let activeCodeBlock = null;

  function flushParagraph() {
    if (currentParagraph && !currentParagraph.lines.length) {
      const index = root.children.indexOf(currentParagraph);
      if (index >= 0) {
        root.children.splice(index, 1);
      }
    }
    currentParagraph = null;
  }

  safeContent.split("\n").forEach((originalLine) => {
    const line = originalLine.replace(/\t/g, "  ");
    const trimmed = line.trim();

    if (activeCodeBlock) {
      activeCodeBlock.lines.push(originalLine);
      if (trimmed.startsWith("```") && activeCodeBlock !== null) {
        activeCodeBlock = null;
      }
      return;
    }

    if (!trimmed) {
      flushParagraph();
      return;
    }

    if (trimmed.startsWith("```") ) {
      flushParagraph();
      const parentNode = stack[stack.length - 1];
      const codeNode = {
        level: parentNode.level + 1,
        indent: parentNode.indent,
        type: "code",
        lines: [trimmed],
        children: []
      };
      parentNode.children.push(codeNode);
      activeCodeBlock = codeNode;
      return;
    }

    const listMatch = line.match(/^(\s*)(?:[-*+]|(?:\d+)[.)])\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      const indentSpaces = listMatch[1].length;
      const level = Math.max(0, Math.floor(indentSpaces / 2));
      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      const parentNode = stack[stack.length - 1];
      const node = {
        level,
        indent: indentSpaces,
        type: "list",
        lines: [listMatch[2].trim()],
        children: []
      };
      parentNode.children.push(node);
      stack.push(node);
      return;
    }

    const indentSpaces = line.match(/^\s*/)[0].length;
    while (stack.length > 1 && indentSpaces <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const currentNode = stack[stack.length - 1];
    if (currentNode.type !== "root" && indentSpaces > currentNode.indent) {
      currentNode.lines.push(trimmed);
      return;
    }

    stack.length = 1;
    if (!currentParagraph) {
      currentParagraph = {
        level: 0,
        indent: 0,
        type: "paragraph",
        lines: [],
        children: []
      };
      root.children.push(currentParagraph);
    }
    currentParagraph.lines.push(trimmed);
  });

  function buildBlocks(nodes) {
    const blocks = [];
    nodes.forEach((node) => {
      const childBlocks = buildBlocks(node.children);
      const rawContent = node.lines.join(node.type === "code" ? "\n" : " ").trim();
      if (!rawContent && !childBlocks.length) {
        return;
      }
      let content;
      if (node.type === "code") {
        content = cleanLogseqMultiline(node.lines.join("\n"));
      } else if (node.type === "paragraph") {
        content = cleanLogseqMultiline(node.lines.join("\n"));
      } else {
        content = cleanLogseqInline(rawContent);
      }
      if (!content && !childBlocks.length) {
        return;
      }
      const block = { content };
      if (childBlocks.length) {
        block.children = childBlocks;
      }
      blocks.push(block);
    });
    return blocks;
  }

  return buildBlocks(root.children);
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

function decodeHtmlEntities(value) {
  if (!value) {
    return "";
  }
  return String(value).replace(/&(#x?[0-9a-f]+|#\d+|[a-zA-Z]+);/g, (match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) {
      const code = parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith("#")) {
      const code = parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    switch (lower) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
      case "lsquo":
      case "rsquo":
        return "'";
      case "nbsp":
        return " ";
      case "hellip":
        return "…";
      case "mdash":
        return "—";
      default:
        return match;
    }
  });
}

function stripHtmlTags(value) {
  if (!value) {
    return "";
  }
  return String(value)
    .replace(/<br\s*\/?>(\r?\n)?/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/?(ul|ol|table|thead|tbody|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

function normalizeTagValue(tag) {
  return typeof tag === "string" ? tag.trim() : "";
}

function normalizeImportStrategy(value) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "overwrite") {
    return "overwrite";
  }
  if (normalized === "latest" || normalized === "keep-latest") {
    return "latest";
  }
  return "skip";
}

function sanitizeImportedHighlight(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const url = sanitizeUrl(raw.url || raw.sourceUrl);
  if (!url) {
    return null;
  }

  const kind = raw.kind === "clip" ? "clip" : "highlight";

  let range = null;
  if (kind === "highlight") {
    range = sanitizeImportedRange(raw.range);
    if (!range) {
      return null;
    }
  }

  const result = {
    id: typeof raw.id === "string" ? raw.id.trim() : "",
    url,
    sourceUrl: sanitizeUrl(raw.sourceUrl) || url,
    title: sanitizeNullableString(raw.title),
    text: sanitizeNullableString(raw.text),
    html: sanitizeNullableString(raw.html),
    note: sanitizeNullableString(raw.note),
    tags: sanitizeTags(raw.tags),
    hostname: sanitizeHostname(raw.hostname, url),
    kind
  };

  if (kind === "highlight") {
    result.range = range;
    const color = sanitizeColor(raw.color);
    if (color) {
      result.color = color;
    }
    result.style = normalizeHighlightStyle(raw.style);
  }

  const createdAt = coerceIsoTimestamp(raw.createdAt);
  if (createdAt) {
    result.createdAt = createdAt;
  }
  const updatedAt = coerceIsoTimestamp(raw.updatedAt);
  if (updatedAt) {
    result.updatedAt = updatedAt;
  }
  const logseqUuid = typeof raw.logseqBlockUuid === "string" ? raw.logseqBlockUuid.trim() : "";
  if (logseqUuid) {
    result.logseqBlockUuid = logseqUuid;
  }
  const syncedAt = coerceIsoTimestamp(raw.logseqSyncedAt);
  if (syncedAt) {
    result.logseqSyncedAt = syncedAt;
  }

  if (!result.text && !result.html) {
    return null;
  }

  if (!result.html) {
    delete result.html;
  }
  if (!result.note) {
    delete result.note;
  }
  if (!result.color) {
    delete result.color;
  }
  if (!result.tags || !result.tags.length) {
    delete result.tags;
  }
  if (!result.title) {
    delete result.title;
  }
  if (!result.text) {
    delete result.text;
  }
  if (!result.hostname) {
    delete result.hostname;
  }
  if (result.kind === "clip") {
    delete result.range;
    delete result.style;
  }

  return result;
}

function sanitizeUrl(value) {
  if (!value || typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(trimmed);
    if (!/^https?:$/i.test(url.protocol)) {
      return "";
    }
    return url.toString();
  } catch (error) {
    return trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : "";
  }
}

function sanitizeNullableString(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed;
}

function sanitizeColor(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : "";
}

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  const normalized = tags
    .map((tag) => normalizeTagValue(tag))
    .filter(Boolean);
  const unique = Array.from(new Set(normalized));
  return unique;
}

function sanitizeHostname(candidate, fallbackUrl) {
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  if (fallbackUrl) {
    return extractHostname(fallbackUrl);
  }
  return "";
}

function sanitizeImportedRange(range) {
  if (!range || typeof range !== "object") {
    return null;
  }
  const start = sanitizeRangeEdge(range.start);
  const end = sanitizeRangeEdge(range.end);
  if (!start || !end) {
    return null;
  }
  return { start, end };
}

function sanitizeRangeEdge(edge) {
  if (!edge || typeof edge !== "object") {
    return null;
  }
  const path = Array.isArray(edge.path)
    ? edge.path.map(sanitizeRangeSegment).filter(Boolean)
    : [];
  if (!path.length) {
    return null;
  }
  const offset = typeof edge.offset === "number" ? edge.offset : parseInt(edge.offset, 10);
  const normalizedOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  return { path, offset: normalizedOffset };
}

function sanitizeRangeSegment(segment) {
  if (!segment || typeof segment !== "object") {
    return null;
  }
  const name = typeof segment.name === "string" ? segment.name.trim() : "";
  const indexRaw = typeof segment.index === "number" ? segment.index : parseInt(segment.index, 10);
  if (!name) {
    return null;
  }
  const index = Number.isFinite(indexRaw) && indexRaw >= 0 ? indexRaw : 0;
  return { name, index };
}

function coerceIsoTimestamp(value) {
  if (!value || typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) {
    return "";
  }
  return new Date(timestamp).toISOString();
}

function buildHighlightSignature(record) {
  if (!record || typeof record !== "object") {
    return "";
  }
  const url = typeof record.url === "string" && record.url ? record.url : record.sourceUrl;
  if (!url || !record.range) {
    return "";
  }
  try {
    return `${url}::${JSON.stringify(record.range)}`;
  } catch (error) {
    return "";
  }
}

function resolveImportConflict(strategy, existing, incoming) {
  if (strategy === "overwrite") {
    return true;
  }
  if (strategy === "skip") {
    return false;
  }
  const incomingTime = getRecordTimestamp(incoming);
  if (!incomingTime) {
    return false;
  }
  const existingTime = getRecordTimestamp(existing);
  if (!existingTime) {
    return true;
  }
  return incomingTime > existingTime;
}

function getRecordTimestamp(record) {
  if (!record || typeof record !== "object") {
    return 0;
  }
  const source = record.updatedAt || record.updated_at || record.createdAt || record.created_at;
  if (!source || typeof source !== "string") {
    return 0;
  }
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? parsed : 0;
}

function applyTimestampFallback(target, fallback) {
  const nowIso = new Date().toISOString();
  if (!target.createdAt) {
    target.createdAt = fallback?.createdAt || fallback?.updatedAt || nowIso;
  }
  if (!target.updatedAt) {
    target.updatedAt = fallback?.updatedAt || target.createdAt || nowIso;
  }
}

function dedupeOrder(order, highlights) {
  if (!Array.isArray(order)) {
    return [];
  }
  const result = [];
  const seen = new Set();
  order.forEach((id) => {
    if (!id || seen.has(id)) {
      return;
    }
    if (!highlights[id]) {
      return;
    }
    seen.add(id);
    result.push(id);
  });
  return result;
}

function htmlToMarkdown(html) {
  if (!html) {
    return "";
  }

  const source = decodeHtmlEntities(html);
  if (!source) {
    return "";
  }

  const fallback = fallbackHtmlToMarkdown(source);
  const normalized = normalizeMarkdown(fallback);
  if (normalized) {
    return normalized;
  }

  return cleanLogseqMultiline(stripHtmlTags(source));
}

function normalizeMarkdown(markdown) {
  return markdown.replace(/\n{3,}/g, "\n\n").trim();
}

function fallbackHtmlToMarkdown(html) {
  if (!html) {
    return "";
  }

  let output = html;
  const preservedPre = [];

  output = annotateHtmlLists(output);

  output = output.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (match, inner) => {
    const normalized = normalizePreBlock(inner);
    const token = `__MYZ_PRE_BLOCK_${preservedPre.length}__`;
    preservedPre.push(normalized);
    return token;
  });

  output = output.replace(/\s*<br\s*\/?>\s*/gi, "\n");
  output = output.replace(/<\/?p[^>]*>/gi, "\n\n");
  output = output.replace(/<\/?div[^>]*>/gi, "\n\n");
  output = output.replace(/<\/?blockquote[^>]*>/gi, (match) => (match.startsWith("</") ? "\n" : "\n> "));
  output = output.replace(/<\/li>/gi, "");
  output = output.replace(/<\/?ul[^>]*>/gi, "\n");
  output = output.replace(/<ol[^>]*>/gi, "\n");
  output = output.replace(/<\/?ol[^>]*>/gi, "\n");
  output = output.replace(/<strong[^>]*>|<b[^>]*>/gi, "**");
  output = output.replace(/<\/strong>|<\/b>/gi, "**");
  output = output.replace(/<em[^>]*>|<i[^>]*>/gi, "*");
  output = output.replace(/<\/em>|<\/i>/gi, "*");
  output = output.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (match, content) => `\`${decodeHtmlEntities(content)}\``);
  output = output.replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  output = output.replace(/<mark[^>]*>(.*?)<\/mark>/gi, "==$1==");
  output = output.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (match, level, text) => `\n\n${"#".repeat(Number(level))} ${text}\n\n`);
  output = output.replace(/<table[^>]*>|<\/table>|<thead[^>]*>|<\/thead>|<tbody[^>]*>|<\/tbody>/gi, "\n");
  output = output.replace(/<tr[^>]*>/gi, "\n");
  output = output.replace(/<\/tr>/gi, "\n");
  output = output.replace(/<t[dh][^>]*>/gi, " | ");
  output = output.replace(/<\/t[dh]>/gi, " ");
  output = output.replace(/<[^>]+>/g, "");
  output = decodeHtmlEntities(output);

  if (preservedPre.length) {
    preservedPre.forEach((block, index) => {
      const token = new RegExp(`__MYZ_PRE_BLOCK_${index}__`, "g");
      output = output.replace(token, `\n\n\`\`\`\n${block}\n\`\`\`\n\n`);
    });
  }

  return output;
}

function annotateHtmlLists(html) {
  if (!html || typeof html !== "string") {
    return html || "";
  }
  const tagPattern = /<\/?([a-zA-Z0-9]+)([^>]*)>/g;
  const stack = [];
  let result = "";
  let lastIndex = 0;

  while (true) {
    const match = tagPattern.exec(html);
    if (!match) {
      result += html.slice(lastIndex);
      break;
    }

    result += html.slice(lastIndex, match.index);
    const raw = match[0];
    const tagName = match[1].toLowerCase();
    const isClosing = raw.startsWith("</");

    if (!isClosing) {
      if (tagName === "ul" || tagName === "ol") {
        stack.push({ type: tagName, counter: 0 });
      } else if (tagName === "li") {
        if (!stack.length) {
          result += "\n- ";
        } else {
          const current = stack[stack.length - 1];
          const depth = Math.max(0, stack.length - 1);
          let marker = "-";
          if (current.type === "ol") {
            current.counter += 1;
            marker = `${current.counter}.`;
          }
          const indent = depth ? "  ".repeat(depth) : "";
          result += `\n${indent}${marker} `;
        }
      } else {
        result += raw;
      }
    } else {
      if ((tagName === "ul" || tagName === "ol") && stack.length) {
        stack.pop();
      } else if (tagName !== "li") {
        result += raw;
      }
    }

    lastIndex = tagPattern.lastIndex;
  }

  return result;
}

function normalizePreBlock(value) {
  const decoded = decodeHtmlEntities(value || "")
    .replace(/<span\b[^>]*>([\s\S]*?)<\/span>/gi, "$1")
    .replace(/<div\b[^>]*>([\s\S]*?)<\/div>/gi, "$1")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  if (!decoded) {
    return "";
  }
  const lines = decoded.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }
  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop();
  }
  return lines.map((line) => line.replace(/\s+$/g, "")).join("\n");
}
