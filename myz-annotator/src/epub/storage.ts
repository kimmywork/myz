import type { SOURCE_TYPES } from "@myz/shared/types";

const DB_NAME = "myz_epub_db";
const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const PROGRESS_STORE = "progress";

export interface EpubProgress {
  sourceKey: string;
  sourceType: SOURCE_TYPES;
  spineIndex: number;
  progression: number;
  title?: string;
  fingerprint?: string;
  updatedAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) {
        db.createObjectStore(HANDLE_STORE);
      }
      if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
        db.createObjectStore(PROGRESS_STORE, { keyPath: "sourceKey" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      // Drop the cached handle if the connection closes or another context
      // needs to upgrade the schema, so the next call reopens it.
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();
  // The connection is cached for the page lifetime; each call still uses its
  // own transaction so writes remain atomic.
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = run(tx.objectStore(storeName));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

export function putFileHandle(key: string, handle: unknown): Promise<void> {
  return withStore<void>(HANDLE_STORE, "readwrite", (store) =>
    store.put(handle, key),
  );
}

export function getFileHandle<T = unknown>(
  key: string,
): Promise<T | undefined> {
  return withStore<T | undefined>(HANDLE_STORE, "readonly", (store) =>
    store.get(key),
  );
}

export function saveProgress(progress: EpubProgress): Promise<void> {
  return withStore<void>(PROGRESS_STORE, "readwrite", (store) =>
    store.put(progress),
  );
}

export function getProgress(
  sourceKey: string,
): Promise<EpubProgress | undefined> {
  return withStore<EpubProgress | undefined>(
    PROGRESS_STORE,
    "readonly",
    (store) => store.get(sourceKey),
  );
}

export async function listProgress(): Promise<EpubProgress[]> {
  const all = await withStore<EpubProgress[]>(
    PROGRESS_STORE,
    "readonly",
    (store) => store.getAll(),
  );
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
