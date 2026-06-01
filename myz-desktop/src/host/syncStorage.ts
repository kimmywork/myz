import type { SyncState } from "@myz/dashboard-core/host";

const DB_NAME = "myz_desktop_sync_db";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("keys")) {
        db.createObjectStore("keys", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("state")) {
        db.createObjectStore("state", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("record_state")) {
        db.createObjectStore("record_state", { keyPath: "recordId" });
      }
      if (!db.objectStoreNames.contains("deletions")) {
        db.createObjectStore("deletions", { keyPath: "recordId" });
      }
      if (!db.objectStoreNames.contains("status")) {
        db.createObjectStore("status", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return dbPromise;
}

function getStore(name: string, mode: IDBTransactionMode) {
  return getDb().then((db) => db.transaction(name, mode).objectStore(name));
}

async function getRecord<T>(
  storeName: string,
  key: IDBValidKey,
): Promise<T | null> {
  const store = await getStore(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function putRecord<T>(storeName: string, value: T): Promise<void> {
  const store = await getStore(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const request = store.put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function deleteRecord(
  storeName: string,
  key: IDBValidKey,
): Promise<void> {
  const store = await getStore(storeName, "readwrite");
  return new Promise((resolve, reject) => {
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAllRecords<T>(storeName: string): Promise<T[]> {
  const store = await getStore(storeName, "readonly");
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export interface DeviceKeyRecord {
  id: "deviceKey";
  key: CryptoKey;
}

export interface KeysetRecord {
  id: "active";
  keyId: string;
  createdAt: string;
  epoch: number;
  cipher: string;
  nonce: string;
}

export interface SyncStateRecord {
  id: "state";
  clientId: string;
  epoch: number;
  keyId: string | null;
  keyUpdatedAt: string | null;
  lastManifestVersion: number;
  lastManifestCreatedAt: string | null;
  lastSyncAt: string | null;
}

export interface RecordStateRecord {
  recordId: string;
  recordHash: string;
  updatedAt: string;
}

export interface DeletionRecord {
  recordId: string;
  deletedAt: string;
}

export interface DesktopSyncStatusRecord {
  id: "status";
  state: SyncState;
  lastError: string | null;
}

export async function readDeviceKey(): Promise<DeviceKeyRecord | null> {
  return getRecord<DeviceKeyRecord>("keys", "deviceKey");
}

export async function writeDeviceKey(record: DeviceKeyRecord): Promise<void> {
  return putRecord("keys", record);
}

export async function readKeysetRecord(): Promise<KeysetRecord | null> {
  return getRecord<KeysetRecord>("keys", "active");
}

export async function writeKeysetRecord(record: KeysetRecord): Promise<void> {
  return putRecord("keys", record);
}

export async function clearKeysetRecord(): Promise<void> {
  await deleteRecord("keys", "active");
}

export async function readSyncState(): Promise<SyncStateRecord | null> {
  return getRecord<SyncStateRecord>("state", "state");
}

export async function writeSyncState(state: SyncStateRecord): Promise<void> {
  return putRecord("state", state);
}

export async function listRecordStates(): Promise<RecordStateRecord[]> {
  return getAllRecords<RecordStateRecord>("record_state");
}

export async function upsertRecordState(
  record: RecordStateRecord,
): Promise<void> {
  return putRecord("record_state", record);
}

export async function removeRecordState(recordId: string): Promise<void> {
  await deleteRecord("record_state", recordId);
}

export async function clearRecordStates(): Promise<void> {
  const records = await listRecordStates();
  await Promise.all(
    records.map((record) => deleteRecord("record_state", record.recordId)),
  );
}

export async function listDeletions(): Promise<DeletionRecord[]> {
  return getAllRecords<DeletionRecord>("deletions");
}

export async function upsertDeletion(record: DeletionRecord): Promise<void> {
  return putRecord("deletions", record);
}

export async function removeDeletion(recordId: string): Promise<void> {
  await deleteRecord("deletions", recordId);
}

export async function clearDeletions(): Promise<void> {
  const records = await listDeletions();
  await Promise.all(
    records.map((record) => deleteRecord("deletions", record.recordId)),
  );
}

export async function readDesktopSyncStatus(): Promise<DesktopSyncStatusRecord | null> {
  return getRecord<DesktopSyncStatusRecord>("status", "status");
}

export async function writeDesktopSyncStatus(
  status: DesktopSyncStatusRecord,
): Promise<void> {
  return putRecord("status", status);
}
