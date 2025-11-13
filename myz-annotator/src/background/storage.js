import {
  DEFAULT_SETTINGS,
  DEFAULT_STATE,
  SETTINGS_KEY,
  STORAGE_KEY,
} from "./constants.js";

import { normalizeHighlightStyle } from "../shared/highlightUtils.js";

export async function readState() {
  const { [STORAGE_KEY]: stored } = await chrome.storage.local.get(STORAGE_KEY);
  if (!stored || typeof stored !== "object") {
    return {
      ...DEFAULT_STATE,
      order: [],
      archives: {},
      archiveQueue: [],
      archiveHistory: [],
    };
  }
  const safeState = {
    highlights: stored.highlights || {},
    order: Array.isArray(stored.order) ? stored.order : [],
    archives: sanitizeArchiveMap(stored.archives),
    archiveQueue: sanitizeArchiveQueue(stored.archiveQueue),
    archiveHistory: sanitizeArchiveHistory(stored.archiveHistory),
  };
  const missing = safeState.order.filter((id) => !safeState.highlights[id]);
  if (missing.length) {
    safeState.order = safeState.order.filter(
      (id) => !!safeState.highlights[id],
    );
  }
  return safeState;
}

export async function writeState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

export async function readSettings() {
  const { [SETTINGS_KEY]: stored } =
    await chrome.storage.local.get(SETTINGS_KEY);
  if (!stored) {
    return { ...DEFAULT_SETTINGS };
  }
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  merged.lastUsedStyle = normalizeHighlightStyle(merged.lastUsedStyle);
  return merged;
}

export async function writeSettings(patch) {
  const current = await readSettings();
  const updated = { ...current, ...patch };
  updated.lastUsedStyle = normalizeHighlightStyle(updated.lastUsedStyle);
  await chrome.storage.local.set({ [SETTINGS_KEY]: updated });
  return updated;
}

export async function persistHighlightPreferences({ color, style } = {}) {
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

export function sortedHighlights(state) {
  return state.order
    .map((id) => state.highlights[id])
    .filter(Boolean)
    .sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
}

export function generateId() {
  return `myz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateUniqueImportId(usedIds) {
  let candidate = generateId();
  while (usedIds.has(candidate)) {
    candidate = generateId();
  }
  usedIds.add(candidate);
  return candidate;
}

function sanitizeArchiveMap(input) {
  if (!input || typeof input !== "object") {
    return {};
  }
  const result = {};
  Object.entries(input).forEach(([key, value]) => {
    if (typeof key !== "string" || !key) {
      return;
    }
    const entry = sanitizeArchiveEntry(value);
    if (entry) {
      result[key] = entry;
    }
  });
  return result;
}

function sanitizeArchiveEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const snapshot = sanitizeArchiveSnapshot(entry.snapshot);
  return {
    status: typeof entry.status === "string" ? entry.status : "unknown",
    snapshot,
    lastCheckedAt:
      typeof entry.lastCheckedAt === "string" ? entry.lastCheckedAt : null,
    lastAttemptAt:
      typeof entry.lastAttemptAt === "string" ? entry.lastAttemptAt : null,
    lastError: typeof entry.lastError === "string" ? entry.lastError : null,
  };
}

function sanitizeArchiveSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }
  const timestamp =
    typeof snapshot.timestamp === "string" ? snapshot.timestamp : null;
  const url = typeof snapshot.url === "string" ? snapshot.url : null;
  if (!timestamp || !url) {
    return null;
  }
  return { timestamp, url };
}

function sanitizeArchiveQueue(queue) {
  if (!Array.isArray(queue)) {
    return [];
  }
  const result = [];
  queue.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const url = typeof entry.url === "string" ? entry.url : "";
    if (!url) {
      return;
    }
    result.push({
      id: typeof entry.id === "string" && entry.id ? entry.id : generateId(),
      url,
      requestedAt:
        typeof entry.requestedAt === "string" ? entry.requestedAt : null,
      status:
        typeof entry.status === "string" && entry.status
          ? entry.status
          : "queued",
      attempts:
        typeof entry.attempts === "number" && entry.attempts >= 0
          ? entry.attempts
          : 0,
      force: Boolean(entry.force),
    });
  });
  return result;
}

function sanitizeArchiveHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }
  const result = [];
  history.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const url = typeof entry.url === "string" ? entry.url : "";
    if (!url) {
      return;
    }
    result.push({
      id: typeof entry.id === "string" && entry.id ? entry.id : generateId(),
      url,
      action: typeof entry.action === "string" ? entry.action : "unknown",
      timestamp: typeof entry.timestamp === "string" ? entry.timestamp : null,
      success: Boolean(entry.success),
      status: typeof entry.status === "string" ? entry.status : "info",
      statusCode:
        typeof entry.statusCode === "number" ? entry.statusCode : null,
      message: typeof entry.message === "string" ? entry.message : "",
    });
  });
  return result;
}
