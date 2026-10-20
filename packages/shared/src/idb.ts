/**
 * Minimal IndexedDB helpers shared by the background store, the sync store,
 * the reader progress stores and the translation cache.
 *
 * Connections are cached per database name and dropped when the browser closes
 * them or another context requests a version upgrade, so a stale handle never
 * wedges later reads or writes. Every operation still runs inside its own
 * transaction so writes stay atomic.
 */

export interface OpenDatabaseOptions {
  /** Database name. */
  name: string
  /** Schema version. */
  version: number
  /** Runs inside `onupgradeneeded` to create/upgrade object stores. */
  upgrade?: (
    db: IDBDatabase,
    oldVersion: number,
    newVersion: number | null,
    transaction: IDBTransaction,
  ) => void
}

const connections = new Map<string, Promise<IDBDatabase>>()

/**
 * Open (or reuse) a cached connection to an IndexedDB database. The connection
 * is reused for the lifetime of the context and recreated after a close or a
 * version change.
 */
export function openDatabase(
  options: OpenDatabaseOptions,
): Promise<IDBDatabase> {
  const { name } = options
  const existing = connections.get(name)
  if (existing) {
    return existing
  }

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, options.version)
    request.onupgradeneeded = (event) => {
      options.upgrade?.(
        request.result,
        event.oldVersion,
        event.newVersion,
        request.transaction!,
      )
    }
    request.onsuccess = () => {
      const db = request.result
      db.onclose = () => {
        connections.delete(name)
      }
      db.onversionchange = () => {
        db.close()
        connections.delete(name)
      }
      resolve(db)
    }
    request.onerror = () => {
      connections.delete(name)
      reject(request.error)
    }
  })

  connections.set(name, promise)
  return promise
}

/**
 * Run a single request against an object store of a cached connection.
 * Returns the request's result on success.
 */
export function withStore<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const request = run(tx.objectStore(storeName))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error)
  })
}

/** Read a single value by key. */
export function idbGet<T>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  return withStore<T | undefined>(db, storeName, "readonly", (store) =>
    store.get(key),
  )
}

/** Read every value in a store. */
export function idbGetAll<T>(
  db: IDBDatabase,
  storeName: string,
): Promise<T[]> {
  return withStore<T[]>(db, storeName, "readonly", (store) => store.getAll())
}

/** Insert or replace a value. */
export function idbPut<T>(
  db: IDBDatabase,
  storeName: string,
  value: T,
): Promise<void> {
  return withStore<void>(db, storeName, "readwrite", (store) =>
    store.put(value),
  )
}

/** Delete a value by key. */
export function idbDelete(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<void> {
  return withStore<void>(db, storeName, "readwrite", (store) =>
    store.delete(key),
  )
}
