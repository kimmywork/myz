import { syncAiRequestHeaderRules } from "./aiHeaders.js";
import { DEFAULT_SETTINGS, SETTINGS_KEY, STORAGE_KEY } from "./constants.js";

import {
  AIAssistantSettings,
  AIProviderSetting,
  Settings,
  VectorSettings,
} from "./settings.js";
import { normalizeHighlightStyle } from "@/shared/highlightUtils.js";
import { MyZRecord } from "@/shared/types.js";

const DB_NAME = "myz_db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("Failed to open database", request.error);
      reject(request.error);
    };

    request.onsuccess = async () => {
      const db = request.result;
      try {
        await migrateFromLocalStorage(db);
      } catch (e) {
        console.error("Migration failed", e);
      }
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (!db.objectStoreNames.contains("highlights")) {
        const store = db.createObjectStore("highlights", { keyPath: "id" });
        store.createIndex("url", "url", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
  return dbPromise;
}

async function migrateFromLocalStorage(db: IDBDatabase) {
  const { [STORAGE_KEY]: stored } = await chrome.storage.local.get(STORAGE_KEY);
  if (!stored || typeof stored !== "object") return;

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["highlights"], "readwrite");

    tx.oncomplete = async () => {
      await chrome.storage.local.remove(STORAGE_KEY);
      console.log("Migrated storage to IndexedDB");
      resolve();
    };

    tx.onerror = () => reject(tx.error);

    const highlightsStore = tx.objectStore("highlights");

    if (stored.highlights) {
      Object.values(stored.highlights).forEach((h: any) =>
        highlightsStore.put(h),
      );
    }
  });
}

function getAllFromStore<T>(storeName: string): Promise<T[]> {
  return getDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

function normalizeAiProvider(
  input: AIProviderSetting | undefined,
  { nameFallback = "AI Provider" } = {},
) {
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

function normalizeAiSettings<T extends AIAssistantSettings & VectorSettings>(
  settings: T,
): T {
  let providers: AIProviderSetting[] = [];
  if (Array.isArray(settings.aiProviders)) {
    providers = settings.aiProviders
      .map((p, idx) =>
        normalizeAiProvider(p, { nameFallback: `Provider ${idx + 1}` }),
      )
      .filter(Boolean) as AIProviderSetting[];
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

export async function saveHighlight(record: MyZRecord) {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("highlights", "readwrite");
    const store = tx.objectStore("highlights");
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteHighlight(id: string) {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("highlights", "readwrite");
    const store = tx.objectStore("highlights");
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getHighlightsForUrl(url: string): Promise<MyZRecord[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("highlights", "readonly");
    const store = tx.objectStore("highlights");
    const index = store.index("url");
    const request = index.getAll(url);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getHighlight(id: string): Promise<MyZRecord | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("highlights", "readonly");
    const store = tx.objectStore("highlights");
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllHighlights(): Promise<MyZRecord[]> {
  const records = await getAllFromStore<MyZRecord>("highlights");
  return records.sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeB - timeA;
  });
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

export async function writeSettings(patch: Partial<Settings>) {
  const current = (await readSettings()) as Settings;
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

export async function persistHighlightPreferences({
  color,
  style,
}: Partial<MyZRecord> = {}) {
  const patch: Partial<Settings> = {};
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

export function generateId() {
  return `myz_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateUniqueImportId(usedIds: Set<string>) {
  let candidate = generateId();
  while (usedIds.has(candidate)) {
    candidate = generateId();
  }
  usedIds.add(candidate);
  return candidate;
}
