import type { SOURCE_TYPES } from "@myz/shared/types";

const DB_NAME = "myz_pdf_db";
const DB_VERSION = 1;
const HANDLE_STORE = "handles";
const PROGRESS_STORE = "progress";

export interface PdfProgress {
  sourceKey: string;
  sourceType: SOURCE_TYPES;
  page: number;
  pages: number;
  title?: string;
  url?: string;
  fingerprint?: string;
  updatedAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = run(tx.objectStore(storeName));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
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

export function saveProgress(progress: PdfProgress): Promise<void> {
  return withStore<void>(PROGRESS_STORE, "readwrite", (store) =>
    store.put(progress),
  );
}

export function getProgress(
  sourceKey: string,
): Promise<PdfProgress | undefined> {
  return withStore<PdfProgress | undefined>(
    PROGRESS_STORE,
    "readonly",
    (store) => store.get(sourceKey),
  );
}

export async function listProgress(): Promise<PdfProgress[]> {
  const all = await withStore<PdfProgress[]>(
    PROGRESS_STORE,
    "readonly",
    (store) => store.getAll(),
  );
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
