import { normalizeHighlightStyle } from "@myz/shared/highlightUtils";
import { MyZRecord, ensureRecordSchemaVersion } from "@myz/shared/types";
import { isRecord, type UnknownRecord } from "@myz/shared/typeUtils";
import { SETTINGS_SCHEMA_VERSION } from "@myz/shared/versioning";
import {
  normalizeSyncSettings,
  type SyncS3Settings,
} from "@myz/sync-core/settings";
import { DEFAULT_SETTINGS, SETTINGS_KEY, STORAGE_KEY } from "./constants.js";
import type { Settings, SettingsBundle } from "./settings.js";
import { openS3Credentials, sealS3Credentials } from "./sync/credentials.js";

const DB_NAME = "myz_db";
const DB_VERSION = 2;

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

      if (!db.objectStoreNames.contains("inbox_state")) {
        db.createObjectStore("inbox_state", { keyPath: "recordId" });
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

    if (isRecord((stored as UnknownRecord).highlights)) {
      Object.values(
        (stored as UnknownRecord).highlights as UnknownRecord,
      ).forEach((highlight) => highlightsStore.put(highlight));
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

function unwrapStoredSettings(stored: unknown): Partial<Settings> | null {
  if (!stored || typeof stored !== "object") {
    return null;
  }
  const candidate = stored as SettingsBundle;
  if (typeof candidate.schemaVersion === "string" && candidate.data) {
    return candidate.data as Partial<Settings>;
  }
  return stored as Partial<Settings>;
}

function wrapSettingsBundle(settings: Settings): SettingsBundle {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    data: settings,
  };
}

function normalizeSettings<T extends Settings>(settings: T): T {
  settings.colorPalette = Array.isArray(settings.colorPalette)
    ? settings.colorPalette.filter((c) => typeof c === "string" && c.trim())
    : [];

  settings.sync = normalizeSyncSettings(settings.sync);
  settings.syncSetupSeen = settings.syncSetupSeen === true;
  settings.inboxEnabled = settings.inboxEnabled !== false;
  settings.inboxReminderEnabled = settings.inboxReminderEnabled !== false;

  return settings;
}

async function openStoredSync(
  rawSync: unknown,
): Promise<Settings["sync"] | null> {
  if (!isRecord(rawSync)) return null;
  const s3 = isRecord(rawSync.s3) ? rawSync.s3 : null;
  if (!s3) return rawSync as unknown as Settings["sync"];
  const opened = await openS3Credentials(s3 as unknown as SyncS3Settings);
  return { ...(rawSync as unknown as Settings["sync"]), s3: opened };
}

async function sealSettingsCredentials(settings: Settings): Promise<Settings> {
  const sealedS3 = await sealS3Credentials(settings.sync.s3);
  return { ...settings, sync: { ...settings.sync, s3: sealedS3 } };
}

export async function saveHighlight(record: MyZRecord) {
  const db = await getDB();
  const normalized = ensureRecordSchemaVersion(record);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("highlights", "readwrite");
    const store = tx.objectStore("highlights");
    const request = store.put(normalized);
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

export async function readSettings(): Promise<Settings> {
  const { [SETTINGS_KEY]: stored } = (await chrome.storage.local.get(
    SETTINGS_KEY,
  )) as {
    [SETTINGS_KEY]?: SettingsBundle | Partial<Settings>;
  };
  const raw = unwrapStoredSettings(stored) || {};
  const openedSync = await openStoredSync((raw as Partial<Settings>).sync);
  const merged = normalizeSettings({
    ...DEFAULT_SETTINGS,
    ...raw,
    ...(openedSync ? { sync: openedSync } : {}),
  });
  merged.lastUsedStyle = normalizeHighlightStyle(merged.lastUsedStyle);
  return merged;
}

export async function writeSettings(
  patch: Partial<Settings>,
): Promise<Settings> {
  const current = await readSettings();
  const updated = normalizeSettings({ ...current, ...patch });
  updated.lastUsedStyle = normalizeHighlightStyle(updated.lastUsedStyle);
  const bundle = wrapSettingsBundle(await sealSettingsCredentials(updated));
  await chrome.storage.local.set({ [SETTINGS_KEY]: bundle });
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

export interface InboxStateRecord {
  recordId: string;
  kind: "status" | "mark" | "rel";
  changedAt: string;
  payload: unknown;
}

export async function readInboxState(
  recordId: string,
): Promise<InboxStateRecord | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("inbox_state", "readonly");
    const request = tx.objectStore("inbox_state").get(recordId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putInboxState(record: InboxStateRecord): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("inbox_state", "readwrite");
    const request = tx.objectStore("inbox_state").put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteInboxState(recordId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("inbox_state", "readwrite");
    const request = tx.objectStore("inbox_state").delete(recordId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAllInboxStates(): Promise<InboxStateRecord[]> {
  return getAllFromStore<InboxStateRecord>("inbox_state");
}
