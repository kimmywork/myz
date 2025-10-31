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
    return { ...DEFAULT_STATE, order: [] };
  }
  const safeState = {
    highlights: stored.highlights || {},
    order: Array.isArray(stored.order) ? stored.order : [],
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
