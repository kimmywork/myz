import { normalizeHighlightStyle } from "@myz/shared/highlightUtils";
import {
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
  openDatabase,
  withStore,
} from "@myz/shared/idb";
import { MyZRecord, ensureRecordSchemaVersion } from "@myz/shared/types";
import { isRecord, type UnknownRecord } from "@myz/shared/typeUtils";
import { SETTINGS_SCHEMA_VERSION } from "@myz/shared/versioning";
import {
  normalizeSyncSettings,
  type SyncS3Settings,
} from "@myz/sync-core/settings";
import { DEFAULT_SETTINGS, SETTINGS_KEY, STORAGE_KEY } from "./constants.js";
import { SettingsRegistry } from "./settings/registry.js";
import type { Settings, SettingsBundle } from "./settings.js";
import { openS3Credentials, sealS3Credentials } from "./sync/credentials.js";
import type { StagedAsset } from "@/stitch/staged-asset.js";

const DB_NAME = "myz_db";
const DB_VERSION = 3;

/**
 * Creates the object stores the first time the db is opened (or upgrades an
 * older one). Store creation is guarded by `contains` so a caller that opens an
 * already-current db is unaffected.
 */
function upgradeSchema(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains("highlights")) {
    const store = db.createObjectStore("highlights", { keyPath: "id" });
    store.createIndex("url", "url", { unique: false });
    store.createIndex("createdAt", "createdAt", { unique: false });
  }

  if (!db.objectStoreNames.contains("inbox_state")) {
    db.createObjectStore("inbox_state", { keyPath: "recordId" });
  }

  if (!db.objectStoreNames.contains("staged_assets")) {
    const store = db.createObjectStore("staged_assets", { keyPath: "id" });
    store.createIndex("createdAt", "createdAt", { unique: false });
  }
}

/**
 * Runs the one-shot `chrome.storage.local` → IndexedDB migration. The shared
 * `openDatabase` caches the connection, so the migration promise is memoized and
 * awaited by every caller rather than re-running on each (re)open.
 */
let migrationPromise: Promise<void> | null = null;

async function getDB(): Promise<IDBDatabase> {
  const db = await openDatabase({
    name: DB_NAME,
    version: DB_VERSION,
    upgrade: upgradeSchema,
  });
  migrationPromise ??= migrateFromLocalStorage(db).catch((e) => {
    console.error("Migration failed", e);
  });
  await migrationPromise;
  return db;
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
  return getDB().then((db) => idbGetAll<T>(db, storeName));
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

/**
 * Assert that a settings object still matches the versioned zod contract. The
 * normalize step above is deliberately lenient (it only fills defaults), so
 * this keeps the schema live and surfaces drift between the schema and the
 * runtime shape instead of letting it rot as dead code.
 */
function assertSettingsShape(settings: Settings, context: string) {
  const schema = SettingsRegistry.versions[SETTINGS_SCHEMA_VERSION];
  const result = schema.safeParse(settings);
  if (!result.success) {
    console.warn(`Settings failed ${context} schema validation`, result.error);
  }
}

async function openStoredSync(
  rawSync: unknown,
): Promise<Settings["sync"] | null> {
  if (!isRecord(rawSync)) return null;
  const s3 = isRecord(rawSync.s3) ? rawSync.s3 : null;
  if (!s3) return normalizeSyncSettings(rawSync);
  // `s3` came out of stored JSON; the encrypted credential fields are sealed,
  // so the app layer only relies on its non-secret string fields here.
  const opened = await openS3Credentials(s3 as SyncS3Settings);
  return { enabled: rawSync.enabled === true, s3: opened };
}

async function sealSettingsCredentials(settings: Settings): Promise<Settings> {
  const sealedS3 = await sealS3Credentials(settings.sync.s3);
  return { ...settings, sync: { ...settings.sync, s3: sealedS3 } };
}

export async function saveHighlight(record: MyZRecord) {
  const db = await getDB();
  const normalized = ensureRecordSchemaVersion(record);
  return idbPut(db, "highlights", normalized);
}

export async function deleteHighlight(id: string) {
  const db = await getDB();
  return idbDelete(db, "highlights", id);
}

export async function getHighlightsForUrl(url: string): Promise<MyZRecord[]> {
  const db = await getDB();
  return withStore<MyZRecord[]>(db, "highlights", "readonly", (store) =>
    store.index("url").getAll(url),
  );
}

export async function getHighlight(id: string): Promise<MyZRecord | undefined> {
  const db = await getDB();
  return idbGet<MyZRecord>(db, "highlights", id);
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
  assertSettingsShape(merged, "read");
  return merged;
}

export async function writeSettings(
  patch: Partial<Settings>,
): Promise<Settings> {
  const current = await readSettings();
  const updated = normalizeSettings({ ...current, ...patch });
  updated.lastUsedStyle = normalizeHighlightStyle(updated.lastUsedStyle);
  assertSettingsShape(updated, "write");
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
  return idbGet<InboxStateRecord>(db, "inbox_state", recordId);
}

export async function putInboxState(record: InboxStateRecord): Promise<void> {
  const db = await getDB();
  return idbPut(db, "inbox_state", record);
}

export async function deleteInboxState(recordId: string): Promise<void> {
  const db = await getDB();
  return idbDelete(db, "inbox_state", recordId);
}

export async function getAllInboxStates(): Promise<InboxStateRecord[]> {
  return getAllFromStore<InboxStateRecord>("inbox_state");
}

// ── Staged assets (capture cache) ───────────────────────────────────────────
// Local-only: these hold base64 image payloads and are deliberately excluded
// from E2EE sync (the protocol is tuned for small text records).

export async function saveStagedAsset(asset: StagedAsset): Promise<void> {
  const db = await getDB();
  return idbPut(db, "staged_assets", asset);
}

/** Newest first. */
export async function getStagedAssets(): Promise<StagedAsset[]> {
  const records = await getAllFromStore<StagedAsset>("staged_assets");
  return records.sort((a, b) =>
    (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
}

export async function getStagedAsset(
  id: string,
): Promise<StagedAsset | undefined> {
  const db = await getDB();
  return idbGet<StagedAsset>(db, "staged_assets", id);
}

export async function deleteStagedAsset(id: string): Promise<void> {
  const db = await getDB();
  return idbDelete(db, "staged_assets", id);
}

export async function clearStagedAssets(): Promise<void> {
  const db = await getDB();
  return withStore<void>(db, "staged_assets", "readwrite", (store) =>
    store.clear(),
  );
}
