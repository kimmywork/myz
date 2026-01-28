import type {
  SkillFileRecord,
  SkillImportPayload,
  SkillInstruction,
  SkillMetadata,
} from "./types.js"
import { buildSkillInstruction, buildSkillMetadata, splitSkillMarkdown, validateSkillMetadata } from "./parser.js"
import { isBuiltinSkill, listBuiltinSkillSeeds } from "./builtins.js"

const DB_NAME = "MyZAgentSkillsDB"
const DB_VERSION = 1
const SKILLS_STORE = "skills"
const FILES_STORE = "skill_files"

let dbPromise: Promise<IDBDatabase> | null = null
let builtinSeedPromise: Promise<void> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SKILLS_STORE)) {
        db.createObjectStore(SKILLS_STORE, { keyPath: "id" })
      }
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        const store = db.createObjectStore(FILES_STORE, { keyPath: "key" })
        store.createIndex("skillId", "skillId", { unique: false })
      }
    }
  })
  return dbPromise
}

async function ensureBuiltinSkills() {
  if (builtinSeedPromise) {
    return builtinSeedPromise
  }
  const seeds = listBuiltinSkillSeeds()
  if (!seeds.length) {
    builtinSeedPromise = Promise.resolve()
    return builtinSeedPromise
  }
  builtinSeedPromise = (async () => {
    const db = await openDb()
    for (const seed of seeds) {
      const existing = await new Promise<SkillMetadata | null>((resolve, reject) => {
        const tx = db.transaction(SKILLS_STORE, "readonly")
        const store = tx.objectStore(SKILLS_STORE)
        const request = store.get(seed.id)
        request.onsuccess = () => resolve((request.result as SkillMetadata) || null)
        request.onerror = () => reject(request.error)
      })
      if (existing) {
        continue
      }
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([SKILLS_STORE, FILES_STORE], "readwrite")
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        const skillsStore = tx.objectStore(SKILLS_STORE)
        const filesStore = tx.objectStore(FILES_STORE)
        skillsStore.put(seed.record)
        seed.files.forEach((file) => {
          filesStore.put({
            key: buildFileKey(seed.id, file.path),
            skillId: seed.id,
            path: file.path,
            content: file.content,
            encoding: file.encoding,
            updatedAt: file.updatedAt,
          })
        })
      })
    }
  })()
  return builtinSeedPromise
}

function buildFileKey(skillId: string, path: string) {
  return `${skillId}::${path}`
}

function normalizePath(path: string) {
  const raw = typeof path === "string" ? path.trim() : ""
  return raw.replace(/^[./]+/, "")
}

async function getSkillRecord(skillId: string): Promise<SkillMetadata | null> {
  await ensureBuiltinSkills()
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SKILLS_STORE, "readonly")
    const store = tx.objectStore(SKILLS_STORE)
    const request = store.get(skillId)
    request.onsuccess = () => {
      const record = (request.result as SkillMetadata) || null
      if (!record) {
        resolve(null)
        return
      }
      resolve(isBuiltinSkill(record.id) ? { ...record, builtin: true } : record)
    }
    request.onerror = () => reject(request.error)
  })
}

async function writeSkillRecord(record: SkillMetadata): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SKILLS_STORE, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    const store = tx.objectStore(SKILLS_STORE)
    store.put(record)
  })
}

async function deleteSkillFiles(skillId: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    const store = tx.objectStore(FILES_STORE)
    const index = store.index("skillId")
    const cursorRequest = index.openCursor(IDBKeyRange.only(skillId))
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result
      if (cursor) {
        cursor.delete()
        cursor.continue()
      }
    }
    cursorRequest.onerror = () => reject(cursorRequest.error)
  })
}

async function upsertSkillFiles(
  skillId: string,
  files: Array<SkillFileRecord>,
): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    const store = tx.objectStore(FILES_STORE)
    files.forEach((file) => {
      store.put({
        key: buildFileKey(skillId, file.path),
        skillId,
        path: file.path,
        content: file.content,
        encoding: file.encoding,
        updatedAt: file.updatedAt,
      })
    })
  })
}

export async function listSkills(): Promise<SkillMetadata[]> {
  await ensureBuiltinSkills()
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SKILLS_STORE, "readonly")
    const store = tx.objectStore(SKILLS_STORE)
    const request = store.getAll()
    request.onsuccess = () => {
      const result = (request.result as SkillMetadata[]) || []
      const normalized = result.map((item) =>
        isBuiltinSkill(item.id) ? { ...item, builtin: true } : item,
      )
      resolve(normalized.sort((a, b) => a.name.localeCompare(b.name)))
    }
    request.onerror = () => reject(request.error)
  })
}

export async function listSkillFiles(skillId: string): Promise<SkillFileRecord[]> {
  await ensureBuiltinSkills()
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readonly")
    const store = tx.objectStore(FILES_STORE)
    const index = store.index("skillId")
    const request = index.getAll(IDBKeyRange.only(skillId))
    request.onsuccess = () => {
      const result = (request.result as SkillFileRecord[]) || []
      resolve(
        result
          .map((file) => ({
            skillId: file.skillId,
            path: file.path,
            content: file.content,
            encoding: file.encoding,
            updatedAt: file.updatedAt,
          }))
          .sort((a, b) => a.path.localeCompare(b.path)),
      )
    }
    request.onerror = () => reject(request.error)
  })
}

export async function getSkillFile(
  skillId: string,
  path: string,
): Promise<SkillFileRecord | null> {
  await ensureBuiltinSkills()
  const db = await openDb()
  const normalizedPath = normalizePath(path)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readonly")
    const store = tx.objectStore(FILES_STORE)
    const request = store.get(buildFileKey(skillId, normalizedPath))
    request.onsuccess = () => {
      const result = request.result
      resolve(
        result
          ? {
              skillId: result.skillId,
              path: result.path,
              content: result.content,
              encoding: result.encoding,
              updatedAt: result.updatedAt,
            }
          : null,
      )
    }
    request.onerror = () => reject(request.error)
  })
}

export async function importSkill(
  payload: SkillImportPayload,
): Promise<{ skill: SkillMetadata }>{
  const files = Array.isArray(payload.files) ? payload.files : []
  const normalizedFiles = files
    .map((file) => ({
      path: normalizePath(file.path),
      content: file.content,
      encoding: file.encoding,
    }))
    .filter((file) => file.path)

  const skillFile = normalizedFiles.find((file) => file.path === "SKILL.md")
  if (!skillFile || skillFile.encoding !== "utf-8") {
    throw new Error("缺少可读取的 SKILL.md")
  }

  const { frontmatter, error } = splitSkillMarkdown(skillFile.content)
  if (error || !frontmatter) {
    throw new Error("无法解析 SKILL.md 的 YAML frontmatter")
  }

  const { name, description, errors } = validateSkillMetadata(frontmatter)
  if (errors.length) {
    throw new Error(errors.join(" "))
  }

  if (payload.rootDir && payload.rootDir.trim() && payload.rootDir.trim() !== name) {
    throw new Error(`SKILL.md name (${name}) 必须与目录名 (${payload.rootDir}) 一致`)
  }

  const now = new Date().toISOString()
  const existing = await getSkillRecord(name)
  const record = buildSkillMetadata(
    {
      ...frontmatter,
      name,
      description,
    },
    now,
    existing,
  )

  const fileRecords: SkillFileRecord[] = normalizedFiles.map((file) => ({
    skillId: name,
    path: file.path,
    content: file.content,
    encoding: file.encoding,
    updatedAt: now,
  }))
  record.fileCount = fileRecords.length

  await writeSkillRecord(record)
  await deleteSkillFiles(name)
  await upsertSkillFiles(name, fileRecords)

  return { skill: record }
}

export async function updateSkillEnabled(skillId: string, enabled: boolean) {
  const existing = await getSkillRecord(skillId)
  if (!existing) {
    throw new Error("Skill not found")
  }
  const next = { ...existing, enabled: Boolean(enabled), updatedAt: new Date().toISOString() }
  await writeSkillRecord(next)
  return next
}

export async function deleteSkill(skillId: string) {
  if (isBuiltinSkill(skillId)) {
    throw new Error("内置 Skill 不允许删除")
  }
  const db = await openDb()
  await deleteSkillFiles(skillId)
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SKILLS_STORE, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    const store = tx.objectStore(SKILLS_STORE)
    store.delete(skillId)
  })
}

export async function updateSkillFile(
  skillId: string,
  path: string,
  content: string,
  encoding: "utf-8" | "base64",
) {
  const normalizedPath = normalizePath(path)
  if (!normalizedPath) {
    throw new Error("文件路径不能为空")
  }
  const existing = await getSkillRecord(skillId)
  if (!existing) {
    throw new Error("Skill not found")
  }
  const now = new Date().toISOString()
  let recordToUpdate = existing

  if (normalizedPath === "SKILL.md" && encoding === "utf-8") {
    const { frontmatter, body, error } = splitSkillMarkdown(content)
    if (error || !frontmatter) {
      throw new Error("无法解析 SKILL.md 的 YAML frontmatter")
    }
    const { name, description, errors } = validateSkillMetadata(frontmatter)
    if (errors.length) {
      throw new Error(errors.join(" "))
    }
    if (name !== skillId) {
      throw new Error("SKILL.md name 不允许修改")
    }
    const nextRecord = buildSkillMetadata(
      {
        ...frontmatter,
        name,
        description,
      },
      now,
      existing,
    )
    nextRecord.enabled = existing.enabled
    nextRecord.createdAt = existing.createdAt
    nextRecord.fileCount = existing.fileCount
    await writeSkillRecord(nextRecord)
    recordToUpdate = nextRecord
    void body
  }

  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, "readwrite")
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    const store = tx.objectStore(FILES_STORE)
    store.put({
      key: buildFileKey(skillId, normalizedPath),
      skillId,
      path: normalizedPath,
      content,
      encoding,
      updatedAt: now,
    })
  })

  const files = await listSkillFiles(skillId)
  const shouldUpdateCount = files.length !== recordToUpdate.fileCount
  if (shouldUpdateCount || recordToUpdate.updatedAt !== now) {
    await writeSkillRecord({
      ...recordToUpdate,
      fileCount: files.length,
      updatedAt: now,
    })
  }
}

export async function getSkillInstruction(
  skillId: string,
): Promise<SkillInstruction | null> {
  const record = await getSkillRecord(skillId)
  if (!record) return null
  const skillFile = await getSkillFile(skillId, "SKILL.md")
  if (!skillFile || skillFile.encoding !== "utf-8") {
    return null
  }
  const { frontmatter, body } = splitSkillMarkdown(skillFile.content)
  const description =
    typeof frontmatter?.description === "string" ? frontmatter.description.trim() : record.description
  const normalizedRecord = { ...record, description }
  return buildSkillInstruction(normalizedRecord, body || "")
}
