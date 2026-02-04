export interface VirtualFileRecord {
  path: string
  content: string
  updatedAt: string
}

const DB_NAME = "MyZAgentVirtualFsDB"
const DB_VERSION = 1
const FILES_STORE = "files"

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: "path" })
      }
    }
  })
  return dbPromise
}

function normalizePath(input: any): string {
  const raw = typeof input === "string" ? input.trim() : ""
  if (!raw) return ""
  const cleaned = raw.replace(/\\/g, "/")
  const parts = cleaned.split("/").filter(Boolean)
  const stack: string[] = []
  for (const part of parts) {
    if (part === "." || part === "") continue
    if (part === "..") {
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join("/")
}

export async function listFiles(dir = ""): Promise<VirtualFileRecord[]> {
  const db = await openDb()
  const normalizedDir = normalizePath(dir)
  const prefix = normalizedDir ? `${normalizedDir}/` : ""

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readonly")
    const store = tx.objectStore(FILES_STORE)
    const request = store.getAll()
    request.onsuccess = () => {
      const records = (request.result as VirtualFileRecord[]) || []
      const filtered = records.filter((record) =>
        prefix ? record.path.startsWith(prefix) : true,
      )
      resolve(
        filtered.sort((a, b) => a.path.localeCompare(b.path)),
      )
    }
    request.onerror = () => reject(request.error)
  })
}

export async function readFile(path: string): Promise<VirtualFileRecord | null> {
  const db = await openDb()
  const normalizedPath = normalizePath(path)
  if (!normalizedPath) return null
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readonly")
    const store = tx.objectStore(FILES_STORE)
    const request = store.get(normalizedPath)
    request.onsuccess = () =>
      resolve((request.result as VirtualFileRecord) || null)
    request.onerror = () => reject(request.error)
  })
}

export async function writeFile(
  path: string,
  content: string,
  line?: number,
): Promise<VirtualFileRecord> {
  const db = await openDb()
  const normalizedPath = normalizePath(path)
  if (!normalizedPath) {
    throw new Error("file_path is required")
  }
  const now = new Date().toISOString()
  const existing = await readFile(normalizedPath)
  let nextContent = String(content ?? "")

  if (typeof line === "number" && Number.isFinite(line) && line > 0) {
    const existingLines = (existing?.content || "").split(/\r?\n/)
    const insertAt = Math.min(existingLines.length, Math.max(0, Math.floor(line) - 1))
    const insertLines = nextContent.split(/\r?\n/)
    existingLines.splice(insertAt, 0, ...insertLines)
    nextContent = existingLines.join("\n")
  }

  const record: VirtualFileRecord = {
    path: normalizedPath,
    content: nextContent,
    updatedAt: now,
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readwrite")
    const store = tx.objectStore(FILES_STORE)
    const request = store.put(record)
    request.onsuccess = () => resolve(record)
    request.onerror = () => reject(request.error)
  })
}
