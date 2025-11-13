import {
  DEFAULT_SETTINGS,
  DEFAULT_STATE,
  DEFAULT_LOGSEQ_PAGE,
  SETTINGS_KEY,
  STORAGE_KEY,
} from "./background/constants.js";

import { normalizeHighlightStyle } from "./shared/highlightUtils.js";

import {
  generateId,
  generateUniqueImportId,
  persistHighlightPreferences,
  readSettings,
  readState,
  sortedHighlights,
  writeSettings,
  writeState,
} from "./background/storage.js";
import { buildActionTitle, normalizeBadgeCounts } from "./background/badge.js";
import { buildMarkdownExport } from "./background/markdown.js";
import {
  normalizeImportStrategy,
  sanitizeImportedHighlight,
  resolveImportConflict,
  applyTimestampFallback,
  buildHighlightSignature,
  dedupeOrder,
} from "./background/import.js";
import {
  buildLogseqEndpointList,
  callLogseq,
  ensureLogseqPage,
  normalizeLogseqEndpoint,
  normalizeLogseqPageName,
  buildHighlightBlock,
  extractInsertedBlockEntities,
  matchInsertedHighlights,
  extractEntityUuid,
} from "./background/logseq.js";
import {
  getArchiveStatusForUrl,
  ensureArchiveSnapshot,
  getArchiveHistory,
  initializeArchiveQueue,
} from "./background/internetArchive.js";

function enrichRecordWithArchive(record, archives) {
  if (!record) {
    return record;
  }
  const canonical = record.url;
  const archiveEntry =
    canonical && archives && typeof archives === "object"
      ? archives[canonical]
      : null;
  const snapshotUrl = archiveEntry?.snapshot?.url || null;
  const snapshotTimestamp = archiveEntry?.snapshot?.timestamp || null;
  const status = archiveEntry?.status || null;
  const enriched = { ...record };
  if (snapshotUrl) {
    enriched.archiveSnapshotUrl = snapshotUrl;
    if (!enriched.archiveUrl) {
      enriched.archiveUrl = snapshotUrl;
    }
  } else if (enriched.archiveUrl) {
    enriched.archiveSnapshotUrl = enriched.archiveUrl;
  }
  if (snapshotTimestamp) {
    enriched.archiveSnapshotTimestamp = snapshotTimestamp;
  }
  if (status) {
    enriched.archiveStatus = status;
  }
  return enriched;
}

function enrichRecordsWithArchive(records, archives) {
  if (!Array.isArray(records)) {
    return [];
  }
  return records.map((record) => enrichRecordWithArchive(record, archives));
}

chrome.runtime.onInstalled.addListener(async () => {
  const { [STORAGE_KEY]: existingHighlights } =
    await chrome.storage.local.get(STORAGE_KEY);
  if (!existingHighlights) {
    await chrome.storage.local.set({ [STORAGE_KEY]: DEFAULT_STATE });
  }
  const { [SETTINGS_KEY]: existingSettings } =
    await chrome.storage.local.get(SETTINGS_KEY);
  if (!existingSettings) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  }
  try {
    // Remove existing if present to avoid duplicate id error
    await chrome.contextMenus.remove("myz-zen-mode").catch(() => {});
    chrome.contextMenus.create({
      id: "myz-zen-mode",
      title: "禅定模式 (仅显示文章)",
      contexts: ["page", "selection"]
    });
    // Add capture as image when in zen mode
    await chrome.contextMenus.remove("myz-zen-capture").catch(() => {});
    chrome.contextMenus.create({
      id: "myz-zen-capture",
      title: "保存文章为图片",
      contexts: ["page", "selection"],
      visible: false,
    });
  } catch (e) {
    // ignore menu creation failures
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  try {
    if (info.menuItemId === "myz-zen-mode") {
      await chrome.tabs.sendMessage(tab.id, { type: "myz:toggleZenMode" });
      await refreshZenMenuForTab(tab.id);
    } else if (info.menuItemId === "myz-zen-capture") {
      // In Zen mode, capture only the target article element instead of full page
      await chrome.tabs.sendMessage(tab.id, { type: "myz:captureZenTargetFull" });
    }
  } catch (e) {
    // ignore
  }
});

// Dynamically update menu title/visibility per tab
async function refreshZenMenuForTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.contextMenus.update("myz-zen-mode", {
      title: "禅定模式 (仅显示文章)",
      visible: false,
    });
    await chrome.contextMenus.update("myz-zen-capture", { visible: false });
    const canResp = await chrome.tabs.sendMessage(tabId, {
      type: "myz:canEnterZenMode",
    });
    const stateResp = await chrome.tabs.sendMessage(tabId, {
      type: "myz:getZenModeState",
    });
    const canEnter = Boolean(canResp?.data?.canEnter);
    const enabled = Boolean(stateResp?.data?.enabled);
    const title = enabled ? "退出禅定模式" : "禅定模式 (仅显示文章)";
    await chrome.contextMenus.update("myz-zen-mode", { title, visible: canEnter || enabled });
    await chrome.contextMenus.update("myz-zen-capture", { visible: enabled });
  } catch (e) {
    await Promise.all([
      chrome.contextMenus
        .update("myz-zen-mode", {
          title: "禅定模式 (仅显示文章)",
          visible: false,
        })
        .catch(() => {}),
      chrome.contextMenus
        .update("myz-zen-capture", { visible: false })
        .catch(() => {}),
    ]);
  }
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  refreshZenMenuForTab(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    refreshZenMenuForTab(tabId);
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  // Content notifies when zen mode state changed (e.g., via shortcuts or internal toggles)
  if (msg && msg.type === "myz:zenModeStateChanged") {
    const tabId = sender?.tab?.id;
    if (tabId) refreshZenMenuForTab(tabId);
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
    const urls = new Set();
    if (typeof payload?.url === "string" && payload.url) {
      urls.add(payload.url);
    }
    if (Array.isArray(payload?.aliases)) {
      payload.aliases.forEach((candidate) => {
        if (typeof candidate === "string" && candidate) {
          urls.add(candidate);
        }
      });
    }
    if (!urls.size) {
      return [];
    }
    const matches = Object.values(state.highlights).filter((item) =>
      urls.has(item.url),
    );
    return enrichRecordsWithArchive(matches, state.archives);
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
      updatedAt: now,
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
      await persistHighlightPreferences({
        color: record.color,
        style: record.style,
      });
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
    const updated = {
      ...existing,
      ...payload,
      kind: requestedKind,
      updatedAt: now,
    };
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
      await persistHighlightPreferences({
        color: updated.color,
        style: updated.style,
      });
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
    const highlights = sortedHighlights(state);
    return enrichRecordsWithArchive(highlights, state.archives);
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
      markdown: buildMarkdownExport(highlights),
    };
  },

  async "myz:updateBadge"(payload, sender) {
    const tabId =
      typeof payload?.tabId === "number" ? payload.tabId : sender?.tab?.id;
    if (typeof tabId !== "number" || Number.isNaN(tabId)) {
      return { success: false };
    }
    const { total, highlightCount, savedCount } = normalizeBadgeCounts(payload);
    const text = total > 0 ? (total > 99 ? "99+" : String(total)) : "";
    await chrome.action.setBadgeText({ tabId, text });
    if (text) {
      await chrome.action.setBadgeBackgroundColor({
        tabId,
        color: [37, 99, 235, 255],
      });
      if (typeof chrome.action.setBadgeTextColor === "function") {
        await chrome.action.setBadgeTextColor({
          tabId,
          color: [255, 255, 255, 255],
        });
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

      let identifier =
        typeof sanitized.id === "string" ? sanitized.id.trim() : "";

      // Handle conflicts with existing highlights first.
      if (
        identifier &&
        existingHighlights[identifier] &&
        !replacements.has(identifier)
      ) {
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
      if (
        identifier &&
        (replacements.has(identifier) || additions.has(identifier))
      ) {
        const staged =
          replacements.get(identifier) || additions.get(identifier);
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
      skipped,
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
      payload?.page || settings.logseqPage || DEFAULT_LOGSEQ_PAGE,
    );
    if (!highlights.length) {
      return {
        success: true,
        inserted: 0,
        message: "没有可同步的标注",
        page: pageName,
      };
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
            args: [uuid],
          });
          if (!existingBlock) {
            recordsToInsertMap.set(record.id, record);
          }
        }

        const recordsToInsert = Array.from(recordsToInsertMap.values());
        const payloadEntries = recordsToInsert
          .map((record) => ({
            record,
            block: buildHighlightBlock(record),
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
            args: [pageUuid, blocksPayload, { sibling: false, before: false }],
          });

          const createdBlocks = extractInsertedBlockEntities(result);
          const blockMatches = await matchInsertedHighlights({
            entries: payloadEntries,
            candidates: createdBlocks,
            pageName,
            endpoint,
            token,
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
              logseqSyncedAt: syncedAt,
            };
            inserted += 1;
            stateMutated = true;
          });
        }

        if (stateMutated) {
          await writeState(state);
        }

        if (
          !settings.logseqEndpoint ||
          normalizeLogseqEndpoint(settings.logseqEndpoint) !== endpoint
        ) {
          await writeSettings({ logseqEndpoint: endpoint });
        }

        return {
          success: true,
          endpoint,
          page: pageName,
          pageUuid,
          inserted,
          total: highlights.length,
          skipped: highlights.length - inserted,
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
    const quality =
      typeof payload?.quality === "number" ? payload.quality : undefined;
    const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
      format,
      quality,
    });
    return { dataUrl };
  },

  async "myz:getArchiveStatusForUrl"(payload) {
    return getArchiveStatusForUrl(payload?.url || "");
  },

  async "myz:ensureArchiveSnapshot"(payload) {
    return ensureArchiveSnapshot({
      url: payload?.url,
      force: Boolean(payload?.force),
    });
  },

  async "myz:getArchiveHistory"() {
    return getArchiveHistory();
  },
};

initializeArchiveQueue();
