import {
  DEFAULT_SETTINGS,
  DEFAULT_STATE,
  SETTINGS_KEY,
  STORAGE_KEY,
} from "./constants.js";

import { normalizeHighlightStyle } from "../shared/highlightUtils.js";
import { syncAiRequestHeaderRules } from "./aiHeaders.js";

function normalizeAiProvider(input, { nameFallback = "AI Provider" } = {}) {
  if (!input || typeof input !== "object") {
    return null;
  }
  const safeId =
    typeof input.id === "string" && input.id.trim()
      ? input.id.trim()
      : `prov_${generateId()}`;
  const safeName =
    typeof input.name === "string" && input.name.trim()
      ? input.name.trim()
      : nameFallback;
  return {
    id: safeId,
    name: safeName,
    apiEndpoint: typeof input.apiEndpoint === "string" ? input.apiEndpoint : "",
    apiKey: typeof input.apiKey === "string" ? input.apiKey : "",
    model: typeof input.model === "string" ? input.model : "gpt-4",
    customModel: typeof input.customModel === "string" ? input.customModel : "",
    contextSize:
      typeof input.contextSize === "string" ? input.contextSize : "32K",
    maxTokens:
      typeof input.maxTokens === "number" && input.maxTokens > 0
        ? input.maxTokens
        : 32768,
    requestHeaders:
      typeof input.requestHeaders === "string" ? input.requestHeaders : "",
    lastTestStatus:
      input.lastTestStatus && typeof input.lastTestStatus === "object"
        ? {
            ok: Boolean(input.lastTestStatus.ok),
            message:
              typeof input.lastTestStatus.message === "string"
                ? input.lastTestStatus.message
                : "",
          }
        : { ok: false, message: "" },
  };
}

function buildLegacyProvider(settings) {
  return normalizeAiProvider(
    {
      id: "provider-default",
      name: "默认 Provider",
      apiEndpoint: settings.aiApiEndpoint || "",
      apiKey: settings.aiApiKey || "",
      model: settings.aiModel || "gpt-4",
      customModel: settings.aiCustomModel || "",
      contextSize: settings.aiContextSize || "32K",
      maxTokens:
        typeof settings.aiMaxTokens === "number" ? settings.aiMaxTokens : 32768,
      requestHeaders: settings.aiRequestHeaders || "",
      lastTestStatus: { ok: true, message: "已迁移" },
    },
    { nameFallback: "默认 Provider" },
  );
}

function normalizeAiSettings(settings) {
  let providers = [];
  if (Array.isArray(settings.aiProviders)) {
    providers = settings.aiProviders
      .map((p, idx) =>
        normalizeAiProvider(p, { nameFallback: `Provider ${idx + 1}` }),
      )
      .filter(Boolean);
  }
  if (
    !providers.length &&
    (settings.aiApiEndpoint || settings.aiApiKey || settings.aiModel)
  ) {
    const legacy = buildLegacyProvider(settings);
    if (legacy) {
      providers.push(legacy);
    }
  }
  settings.aiProviders = providers;

  if (!settings.aiActiveProviderId && providers.length) {
    const okProvider = providers.find((p) => p.lastTestStatus?.ok);
    settings.aiActiveProviderId = okProvider ? okProvider.id : null;
  }
  const activeProvider =
    providers.find(
      (p) => p.id === settings.aiActiveProviderId && p.lastTestStatus?.ok,
    ) || null;

  if (!activeProvider) {
    const fallback = providers.find((p) => p.lastTestStatus?.ok);
    settings.aiActiveProviderId = fallback ? fallback.id : null;
  }

  const selected =
    providers.find(
      (p) => p.id === settings.aiActiveProviderId && p.lastTestStatus?.ok,
    ) || null;
  settings.aiApiEndpoint = selected?.apiEndpoint || "";
  settings.aiApiKey = selected?.apiKey || "";
  settings.aiModel = selected?.model || "gpt-4";
  settings.aiCustomModel = selected?.customModel || "";
  settings.aiContextSize = selected?.contextSize || "32K";
  settings.aiMaxTokens =
    typeof selected?.maxTokens === "number" ? selected.maxTokens : 32768;
  settings.aiRequestHeaders = selected?.requestHeaders || "";
  settings.vectorSearchEnabled = Boolean(settings.vectorSearchEnabled);
  settings.vectorModelReady = Boolean(
    settings.vectorSearchEnabled && settings.vectorModelReady,
  );
  settings.vectorUseLocalModel =
    settings.vectorUseLocalModel !== false &&
    settings.vectorUseLocalModel !== "remote";
  settings.vectorOpenAiEndpoint =
    typeof settings.vectorOpenAiEndpoint === "string"
      ? settings.vectorOpenAiEndpoint
      : "";
  settings.vectorOpenAiApiKey =
    typeof settings.vectorOpenAiApiKey === "string"
      ? settings.vectorOpenAiApiKey
      : "";
  settings.vectorOpenAiModel =
    typeof settings.vectorOpenAiModel === "string"
      ? settings.vectorOpenAiModel
      : "text-embedding-3-small";
  settings.vectorMaxChars =
    typeof settings.vectorMaxChars === "number" && settings.vectorMaxChars > 0
      ? Math.floor(settings.vectorMaxChars)
      : 500;

  return settings;
}

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
    return normalizeAiSettings({ ...DEFAULT_SETTINGS });
  }
  const merged = normalizeAiSettings({ ...DEFAULT_SETTINGS, ...stored });
  merged.lastUsedStyle = normalizeHighlightStyle(merged.lastUsedStyle);
  return merged;
}

export async function writeSettings(patch) {
  const current = await readSettings();
  const updated = normalizeAiSettings({ ...current, ...patch });
  updated.lastUsedStyle = normalizeHighlightStyle(updated.lastUsedStyle);
  await chrome.storage.local.set({ [SETTINGS_KEY]: updated });
  try {
    await syncAiRequestHeaderRules(updated);
  } catch (error) {
    console.warn("Failed to sync AI header rules", error);
  }
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
