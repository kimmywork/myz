import {
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
  openDatabase,
} from "@myz/shared/idb";

const DB_NAME = "myz_sync_db";
const DB_VERSION = 2;

/** Creates the key/state stores the first time the sync db is opened. */
function upgradeSchema(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains("keys")) {
    db.createObjectStore("keys", { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains("state")) {
    db.createObjectStore("state", { keyPath: "id" });
  }
  if (!db.objectStoreNames.contains("deletions")) {
    db.createObjectStore("deletions", { keyPath: "recordId" });
  }
  if (!db.objectStoreNames.contains("record_state")) {
    db.createObjectStore("record_state", { keyPath: "recordId" });
  }
  if (!db.objectStoreNames.contains("stream_state")) {
    db.createObjectStore("stream_state", { keyPath: "streamId" });
  }
}

function getDb(): Promise<IDBDatabase> {
  return openDatabase({
    name: DB_NAME,
    version: DB_VERSION,
    upgrade: upgradeSchema,
  });
}

async function getRecord<T>(
  storeName: string,
  key: IDBValidKey,
): Promise<T | null> {
  const db = await getDb();
  const value = await idbGet<T>(db, storeName, key);
  return value ?? null;
}

async function putRecord<T>(storeName: string, value: T): Promise<void> {
  const db = await getDb();
  return idbPut(db, storeName, value);
}

async function deleteRecord(
  storeName: string,
  key: IDBValidKey,
): Promise<void> {
  const db = await getDb();
  return idbDelete(db, storeName, key);
}

async function getAllRecords<T>(storeName: string): Promise<T[]> {
  const db = await getDb();
  return idbGetAll<T>(db, storeName);
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

export interface DeviceKeyPairRecord {
  id: "deviceKeyPair";
  signPub: string;
  agreePub: string;
  nonce: string;
  cipher: string;
}

export interface AccountRecord {
  id: "account";
  accountId: string;
  epoch: number;
  roster: string;
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

export interface DeletionRecord {
  recordId: string;
  deletedAt: string;
}

export interface RecordStateRecord {
  recordId: string;
  recordHash: string;
  updatedAt: string;
}

export interface StreamStateRecord {
  accountId: string;
  streamId: string;
  streamVersion: number;
  shardHashes: Record<string, string>;
  tombstones: Record<string, string>;
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

export async function readDeviceKeyPair(): Promise<DeviceKeyPairRecord | null> {
  return getRecord<DeviceKeyPairRecord>("keys", "deviceKeyPair");
}

export async function writeDeviceKeyPair(
  record: DeviceKeyPairRecord,
): Promise<void> {
  return putRecord("keys", record);
}

export async function clearDeviceKeyPair(): Promise<void> {
  await deleteRecord("keys", "deviceKeyPair");
}

export async function readAccountRecord(): Promise<AccountRecord | null> {
  return getRecord<AccountRecord>("keys", "account");
}

export async function writeAccountRecord(record: AccountRecord): Promise<void> {
  return putRecord("keys", record);
}

export async function clearAccountRecord(): Promise<void> {
  await deleteRecord("keys", "account");
}

export async function readSyncState(): Promise<SyncStateRecord | null> {
  return getRecord<SyncStateRecord>("state", "state");
}

export async function writeSyncState(state: SyncStateRecord): Promise<void> {
  return putRecord("state", state);
}

export async function clearSyncState(): Promise<void> {
  await deleteRecord("state", "state");
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

export async function readStreamState(
  streamId: string,
): Promise<StreamStateRecord | null> {
  return getRecord<StreamStateRecord>("stream_state", streamId);
}

export async function writeStreamState(
  record: StreamStateRecord,
): Promise<void> {
  return putRecord("stream_state", record);
}

export async function clearStreamStates(): Promise<void> {
  const records = await getAllRecords<StreamStateRecord>("stream_state");
  await Promise.all(
    records.map((record) => deleteRecord("stream_state", record.streamId)),
  );
}
