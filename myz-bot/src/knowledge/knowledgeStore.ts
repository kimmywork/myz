import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs"
import { resolve, join, basename } from "node:path"
import type {
  KnowledgeLayer,
  KnowledgeEntry,
  KnowledgeEntryMeta,
  KnowledgeIndex,
  KnowledgeIndexEntry,
} from "./types"
import { KNOWLEDGE_SCHEMA_VERSION } from "./types"

const LAYER_DIRS: KnowledgeLayer[] = ["concepts", "structure", "behavior", "ops"]

function generateId(layer: KnowledgeLayer): string {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return `k-${layer}-${ts}-${rand}`
}

function ensureLayerDir(knowledgeDir: string, layer: KnowledgeLayer): string {
  const dir = resolve(knowledgeDir, layer)
  mkdirSync(dir, { recursive: true })
  return dir
}

function entryPath(knowledgeDir: string, layer: KnowledgeLayer, id: string): string {
  return resolve(knowledgeDir, layer, `${id}.md`)
}

function indexPath(knowledgeDir: string): string {
  return resolve(knowledgeDir, "index.json")
}

export function loadIndex(knowledgeDir: string): KnowledgeIndex {
  const path = indexPath(knowledgeDir)
  if (!existsSync(path)) {
    return { schemaVersion: KNOWLEDGE_SCHEMA_VERSION, entries: [] }
  }
  try {
    const raw = readFileSync(path, "utf-8")
    return JSON.parse(raw) as KnowledgeIndex
  } catch {
    return { schemaVersion: KNOWLEDGE_SCHEMA_VERSION, entries: [] }
  }
}

export function saveIndex(knowledgeDir: string, index: KnowledgeIndex): void {
  writeFileSync(indexPath(knowledgeDir), JSON.stringify(index, null, 2))
}

function serializeEntry(entry: KnowledgeEntry): string {
  const frontmatter = [
    "---",
    `id: ${entry.meta.id}`,
    `layer: ${entry.meta.layer}`,
    `title: "${entry.meta.title.replace(/"/g, '\\"')}"`,
    `tags: [${entry.meta.tags.map((t) => `"${t}"`).join(", ")}]`,
    `sourceRecordIds: [${entry.meta.sourceRecordIds.map((id) => `"${id}"`).join(", ")}]`,
    `sourceUrls: [${entry.meta.sourceUrls.map((u) => `"${u}"`).join(", ")}]`,
    `createdAt: "${entry.meta.createdAt}"`,
    `updatedAt: "${entry.meta.updatedAt}"`,
    `confidence: ${entry.meta.confidence}`,
    `accessCount: ${entry.meta.accessCount}`,
    entry.meta.expiresAt ? `expiresAt: "${entry.meta.expiresAt}"` : null,
    entry.meta.relatedEntryIds.length
      ? `relatedEntryIds: [${entry.meta.relatedEntryIds.map((id) => `"${id}"`).join(", ")}]`
      : null,
    entry.meta.pinned ? "pinned: true" : null,
    entry.meta.promotedTo ? `promotedTo: "${entry.meta.promotedTo}"` : null,
    entry.meta.archived ? "archived: true" : null,
    "---",
    "",
    entry.body,
  ]
    .filter((line) => line !== null)
    .join("\n")
  return frontmatter
}

function parseEntry(content: string, filePath: string): KnowledgeEntry | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return null

  const metaBlock = match[1]
  const body = match[2].trim()

  const getField = (key: string): string => {
    const re = new RegExp(`^${key}:\\s*(.+)$`, "m")
    const m = metaBlock.match(re)
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""
  }

  const getArray = (key: string): string[] => {
    const re = new RegExp(`^${key}:\\s*\\[(.*)\\]$`, "m")
    const m = metaBlock.match(re)
    if (!m) return []
    return m[1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean)
  }

  const getBool = (key: string): boolean => {
    const re = new RegExp(`^${key}:\\s*true$`, "m")
    return re.test(metaBlock)
  }

  const getNum = (key: string, fallback: number): number => {
    const re = new RegExp(`^${key}:\\s*([\\d.]+)$`, "m")
    const m = metaBlock.match(re)
    return m ? Number(m[1]) : fallback
  }

  const id = getField("id") || basename(filePath, ".md")
  const layer = getField("layer") as KnowledgeLayer

  return {
    meta: {
      id,
      layer,
      title: getField("title"),
      tags: getArray("tags"),
      sourceRecordIds: getArray("sourceRecordIds"),
      sourceUrls: getArray("sourceUrls"),
      createdAt: getField("createdAt") || new Date().toISOString(),
      updatedAt: getField("updatedAt") || new Date().toISOString(),
      confidence: getNum("confidence", 0.5),
      accessCount: getNum("accessCount", 0),
      expiresAt: getField("expiresAt") || undefined,
      relatedEntryIds: getArray("relatedEntryIds"),
      pinned: getBool("pinned"),
      promotedTo: getField("promotedTo") || undefined,
      archived: getBool("archived"),
    },
    body,
  }
}

export function createEntry(
  knowledgeDir: string,
  layer: KnowledgeLayer,
  data: {
    title: string
    body: string
    tags?: string[]
    sourceRecordIds?: string[]
    sourceUrls?: string[]
    confidence?: number
    expiresAt?: string
    relatedEntryIds?: string[]
    pinned?: boolean
  },
): KnowledgeEntry {
  const now = new Date().toISOString()
  const id = generateId(layer)
  const entry: KnowledgeEntry = {
    meta: {
      id,
      layer,
      title: data.title,
      tags: data.tags || [],
      sourceRecordIds: data.sourceRecordIds || [],
      sourceUrls: data.sourceUrls || [],
      createdAt: now,
      updatedAt: now,
      confidence: data.confidence ?? 0.5,
      accessCount: 0,
      expiresAt: data.expiresAt,
      relatedEntryIds: data.relatedEntryIds || [],
      pinned: data.pinned,
    },
    body: data.body,
  }

  ensureLayerDir(knowledgeDir, layer)
  writeFileSync(entryPath(knowledgeDir, layer, id), serializeEntry(entry))

  const index = loadIndex(knowledgeDir)
  index.entries.push({
    id,
    layer,
    title: data.title,
    tags: data.tags || [],
    filePath: `${layer}/${id}.md`,
    updatedAt: now,
    confidence: data.confidence ?? 0.5,
    accessCount: 0,
    sourceRecordIds: data.sourceRecordIds || [],
    expiresAt: data.expiresAt,
    pinned: data.pinned,
  })
  saveIndex(knowledgeDir, index)

  return entry
}

export function getEntry(knowledgeDir: string, entryId: string): KnowledgeEntry | null {
  const index = loadIndex(knowledgeDir)
  const idxEntry = index.entries.find((e) => e.id === entryId)
  if (!idxEntry) return null

  const filePath = resolve(knowledgeDir, idxEntry.filePath)
  if (!existsSync(filePath)) return null

  const content = readFileSync(filePath, "utf-8")
  return parseEntry(content, filePath)
}

export function updateEntry(
  knowledgeDir: string,
  entryId: string,
  patch: {
    title?: string
    body?: string
    tags?: string[]
    confidence?: number
    accessCount?: number
    expiresAt?: string
    pinned?: boolean
    promotedTo?: string
    archived?: boolean
    appendRelatedIds?: string[]
  },
): KnowledgeEntry | null {
  const index = loadIndex(knowledgeDir)
  const idxEntry = index.entries.find((e) => e.id === entryId)
  if (!idxEntry) return null

  const filePath = resolve(knowledgeDir, idxEntry.filePath)
  if (!existsSync(filePath)) return null

  const content = readFileSync(filePath, "utf-8")
  const entry = parseEntry(content, filePath)
  if (!entry) return null

  const now = new Date().toISOString()
  if (patch.title !== undefined) entry.meta.title = patch.title
  if (patch.body !== undefined) entry.body = patch.body
  if (patch.tags !== undefined) entry.meta.tags = patch.tags
  if (patch.confidence !== undefined) entry.meta.confidence = patch.confidence
  if (patch.accessCount !== undefined) entry.meta.accessCount = patch.accessCount
  if (patch.expiresAt !== undefined) entry.meta.expiresAt = patch.expiresAt
  if (patch.pinned !== undefined) entry.meta.pinned = patch.pinned
  if (patch.promotedTo !== undefined) entry.meta.promotedTo = patch.promotedTo
  if (patch.archived !== undefined) entry.meta.archived = patch.archived
  if (patch.appendRelatedIds) {
    entry.meta.relatedEntryIds = [
      ...new Set([...entry.meta.relatedEntryIds, ...patch.appendRelatedIds]),
    ]
  }
  entry.meta.updatedAt = now

  writeFileSync(filePath, serializeEntry(entry))

  const idxIdx = index.entries.findIndex((e) => e.id === entryId)
  if (idxIdx >= 0) {
    index.entries[idxIdx] = {
      ...index.entries[idxIdx],
      title: entry.meta.title,
      tags: entry.meta.tags,
      updatedAt: now,
      confidence: entry.meta.confidence,
      accessCount: entry.meta.accessCount,
      expiresAt: entry.meta.expiresAt,
      pinned: entry.meta.pinned,
      archived: entry.meta.archived,
    }
    saveIndex(knowledgeDir, index)
  }

  return entry
}

export function deleteEntry(knowledgeDir: string, entryId: string): boolean {
  const index = loadIndex(knowledgeDir)
  const idxEntry = index.entries.find((e) => e.id === entryId)
  if (!idxEntry) return false

  const filePath = resolve(knowledgeDir, idxEntry.filePath)
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }

  index.entries = index.entries.filter((e) => e.id !== entryId)
  saveIndex(knowledgeDir, index)
  return true
}

export function listEntries(
  knowledgeDir: string,
  options?: {
    layer?: KnowledgeLayer
    tags?: string[]
    includeArchived?: boolean
  },
): KnowledgeIndexEntry[] {
  const index = loadIndex(knowledgeDir)
  let entries = index.entries

  if (!options?.includeArchived) {
    entries = entries.filter((e) => !e.archived)
  }

  if (options?.layer) {
    entries = entries.filter((e) => e.layer === options.layer)
  }

  if (options?.tags?.length) {
    const tagSet = new Set(options.tags)
    entries = entries.filter((e) => e.tags.some((t) => tagSet.has(t)))
  }

  return entries
}

export function searchEntries(
  knowledgeDir: string,
  query: string,
  options?: {
    layer?: KnowledgeLayer
    limit?: number
  },
): KnowledgeIndexEntry[] {
  const index = loadIndex(knowledgeDir)
  const q = query.toLowerCase()
  let entries = index.entries.filter(
    (e) =>
      !e.archived &&
      (e.title.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))),
  )

  if (options?.layer) {
    entries = entries.filter((e) => e.layer === options.layer)
  }

  if (options?.limit) {
    entries = entries.slice(0, options.limit)
  }

  return entries
}

export function initKnowledgeDirs(knowledgeDir: string): void {
  for (const layer of LAYER_DIRS) {
    ensureLayerDir(knowledgeDir, layer)
  }
  const inboxDir = resolve(knowledgeDir, "inbox")
  mkdirSync(inboxDir, { recursive: true })
}
