import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { resolve } from "node:path"

export interface MemoryItem {
  id: string
  title: string
  tags: string[]
  createdAt: string
  file: string
}

export interface StoredMemory {
  id: string
  file: string
  createdAt: string
  deduplicated?: boolean
}

export interface MemoryEntry extends MemoryItem {
  content: string
  kind: "memory" | "summary"
  conversationId?: string
  dateKey: string
  legacy?: boolean
}

const MEMORY_METADATA_PREFIX = "<!-- myz-memory "
const MEMORY_METADATA_SUFFIX = " -->"
const MEMORY_FILE_NAME = "MEMORY.md"
export const DEFAULT_MEMORY_FILE_CONTENT = "# MEMORY.md\n\n这里记录长期稳定记忆。\n"
const DAILY_LOG_PATTERN = /^\d{4}-\d{2}-\d{2}\.md$/

function formatLocalDate(date = new Date()) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getMemoryFilePath(memoryDir: string) {
  return resolve(memoryDir, MEMORY_FILE_NAME)
}

function getLegacyIndexPath(memoryDir: string) {
  return resolve(memoryDir, "index.json")
}

function getLegacyNotesDir(memoryDir: string) {
  return resolve(memoryDir, "notes")
}

function getLegacySummariesDir(memoryDir: string) {
  return resolve(memoryDir, "conversation-summaries")
}

function getDailyLogPath(memoryDir: string, dateKey = formatLocalDate()) {
  return resolve(memoryDir, `${dateKey}.md`)
}

function isDailyLogName(name: string) {
  return DAILY_LOG_PATTERN.test(name)
}

function normalizeMemoryBody(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .trim()
}

function normalizeTags(tags?: string[]) {
  return Array.from(
    new Set(
      Array.isArray(tags)
        ? tags
            .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
            .filter(Boolean)
        : [],
    ),
  )
}

function ensureDailyLogFile(memoryDir: string, dateKey: string) {
  const file = getDailyLogPath(memoryDir, dateKey)
  if (!existsSync(file)) {
    writeFileSync(file, `# ${dateKey}\n`)
  }
  return file
}

function serializeMemoryEntry(entry: MemoryEntry) {
  const metadata = {
    id: entry.id,
    title: entry.title,
    tags: entry.tags,
    createdAt: entry.createdAt,
    kind: entry.kind,
    conversationId: entry.conversationId || "",
  }
  return [
    `## ${entry.createdAt} | ${entry.title}`,
    `${MEMORY_METADATA_PREFIX}${JSON.stringify(metadata)}${MEMORY_METADATA_SUFFIX}`,
    entry.content.trim(),
  ].join("\n")
}

function appendMemoryEntry(memoryDir: string, entry: MemoryEntry) {
  ensureMemoryDir(memoryDir)
  return appendMemoryEntryDirect(memoryDir, entry)
}

function appendMemoryEntryDirect(memoryDir: string, entry: MemoryEntry) {
  const file = ensureDailyLogFile(memoryDir, entry.dateKey)
  const current = existsSync(file) ? readFileSync(file, "utf-8").trimEnd() : ""
  const next = [current, serializeMemoryEntry(entry)].filter(Boolean).join("\n\n").trimEnd() + "\n"
  writeFileSync(file, next)
  return file
}

function parseMetadataLine(line: string) {
  const trimmed = line.trim()
  if (
    !trimmed.startsWith(MEMORY_METADATA_PREFIX) ||
    !trimmed.endsWith(MEMORY_METADATA_SUFFIX)
  ) {
    return null
  }
  const raw = trimmed
    .slice(MEMORY_METADATA_PREFIX.length, trimmed.length - MEMORY_METADATA_SUFFIX.length)
    .trim()
  if (!raw) return null
  try {
    return JSON.parse(raw) as {
      id?: string
      title?: string
      tags?: string[]
      createdAt?: string
      kind?: "memory" | "summary"
      conversationId?: string
    }
  } catch {
    return null
  }
}

function parseDailyEntriesFromFile(file: string): MemoryEntry[] {
  if (!existsSync(file)) return []
  const raw = readFileSync(file, "utf-8").replace(/\r\n/g, "\n")
  const lines = raw.split("\n")
  const entries: MemoryEntry[] = []
  const dateKey = file.split("/").pop()?.replace(/\.md$/, "") || formatLocalDate()

  let currentHeading = ""
  let currentMetadata: ReturnType<typeof parseMetadataLine> = null
  let body: string[] = []

  const flush = () => {
    if (!currentHeading || !currentMetadata?.id) {
      currentHeading = ""
      currentMetadata = null
      body = []
      return
    }
    const titleFromHeading = currentHeading.replace(/^##\s+/, "").split("|").slice(1).join("|").trim()
    const title =
      (typeof currentMetadata.title === "string" && currentMetadata.title.trim()) ||
      titleFromHeading ||
      "未命名记忆"
    const createdAt =
      (typeof currentMetadata.createdAt === "string" && currentMetadata.createdAt.trim()) ||
      currentHeading.replace(/^##\s+/, "").split("|")[0]?.trim() ||
      new Date().toISOString()
    const content = normalizeMemoryBody(body.join("\n"))
    if (!content) {
      currentHeading = ""
      currentMetadata = null
      body = []
      return
    }
    entries.push({
      id: currentMetadata.id,
      title,
      tags: normalizeTags(currentMetadata.tags),
      createdAt,
      file,
      content,
      kind: currentMetadata.kind === "summary" ? "summary" : "memory",
      conversationId:
        typeof currentMetadata.conversationId === "string" && currentMetadata.conversationId.trim()
          ? currentMetadata.conversationId.trim()
          : undefined,
      dateKey,
    })
    currentHeading = ""
    currentMetadata = null
    body = []
  }

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush()
      currentHeading = line.trim()
      continue
    }
    if (currentHeading && !currentMetadata) {
      const parsed = parseMetadataLine(line)
      if (parsed) {
        currentMetadata = parsed
        continue
      }
    }
    if (currentHeading) {
      body.push(line)
    }
  }
  flush()

  return entries
}

function loadLegacyMemoryEntries(memoryDir: string): MemoryEntry[] {
  const indexFile = getLegacyIndexPath(memoryDir)
  if (!existsSync(indexFile)) return []
  try {
    const parsed = JSON.parse(readFileSync(indexFile, "utf-8")) as {
      items?: Array<{
        id?: string
        title?: string
        tags?: string[]
        createdAt?: string
        file?: string
      }>
    }
    const items = Array.isArray(parsed.items) ? parsed.items : []
    const entries = items
      .map((item): MemoryEntry | null => {
        const file = typeof item.file === "string" ? item.file : ""
        if (!file || !existsSync(file)) return null
        const createdAt =
          typeof item.createdAt === "string" && item.createdAt.trim()
            ? item.createdAt
            : new Date().toISOString()
        return {
          id: typeof item.id === "string" ? item.id : "",
          title: typeof item.title === "string" ? item.title : "未命名记忆",
          tags: normalizeTags(item.tags),
          createdAt,
          file,
          content: normalizeMemoryBody(readFileSync(file, "utf-8")),
          kind: "memory" as const,
          conversationId:
            Array.isArray(item.tags)
              ? item.tags.find((tag) => typeof tag === "string" && tag.startsWith("conversation:"))
                  ?.replace(/^conversation:/, "") || undefined
              : undefined,
          dateKey: formatLocalDate(new Date(createdAt)),
          legacy: true,
        } satisfies MemoryEntry
      })
      .filter((item) => Boolean(item && item.id && item.content))
    return entries as MemoryEntry[]
  } catch {
    return []
  }
}

function loadLegacySummaryEntries(memoryDir: string): MemoryEntry[] {
  const summariesDir = getLegacySummariesDir(memoryDir)
  if (!existsSync(summariesDir)) return []
  const entries = readdirSync(summariesDir)
    .filter((name) => name.endsWith(".md"))
    .map((name): MemoryEntry | null => {
      const file = resolve(summariesDir, name)
      const conversationId = name.replace(/\.md$/, "")
      const raw = normalizeMemoryBody(readFileSync(file, "utf-8"))
      if (!raw) return null
      const createdAt = statSync(file).mtime.toISOString()
      return {
        id: `summary-legacy-${conversationId}`,
        title: `会话摘要 ${conversationId}`,
        tags: ["summary", `conversation:${conversationId}`],
        createdAt,
        file,
        content: raw,
        kind: "summary" as const,
        conversationId,
        dateKey: formatLocalDate(new Date(createdAt)),
        legacy: true,
      } satisfies MemoryEntry
    })
    .filter((entry) => Boolean(entry))
  return entries as MemoryEntry[]
}

function migrateLegacyMemoryStorage(memoryDir: string) {
  const legacyIndexPath = getLegacyIndexPath(memoryDir)
  const legacyNotesDir = getLegacyNotesDir(memoryDir)
  const legacySummariesDir = getLegacySummariesDir(memoryDir)
  const hasLegacyStorage =
    existsSync(legacyIndexPath) ||
    existsSync(legacyNotesDir) ||
    existsSync(legacySummariesDir)
  if (!hasLegacyStorage) return

  const existingIds = new Set(
    readdirSync(memoryDir)
      .filter(isDailyLogName)
      .flatMap((name) => parseDailyEntriesFromFile(resolve(memoryDir, name)))
      .map((entry) => entry.id),
  )
  const legacyEntries = [
    ...loadLegacyMemoryEntries(memoryDir),
    ...loadLegacySummaryEntries(memoryDir),
  ].sort((left, right) => left.createdAt.localeCompare(right.createdAt))

  legacyEntries.forEach((entry) => {
    if (!entry.id || existingIds.has(entry.id)) return
    appendMemoryEntryDirect(memoryDir, {
      ...entry,
      file: getDailyLogPath(memoryDir, entry.dateKey),
      legacy: false,
    })
    existingIds.add(entry.id)
  })

  if (existsSync(legacyIndexPath)) {
    unlinkSync(legacyIndexPath)
  }
  if (existsSync(legacyNotesDir)) {
    rmSync(legacyNotesDir, { recursive: true, force: true })
  }
  if (existsSync(legacySummariesDir)) {
    rmSync(legacySummariesDir, { recursive: true, force: true })
  }
}

export function ensureMemoryDir(memoryDir: string) {
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true })
  }
  const memoryFile = getMemoryFilePath(memoryDir)
  if (!existsSync(memoryFile)) {
    writeFileSync(memoryFile, DEFAULT_MEMORY_FILE_CONTENT)
  }
  migrateLegacyMemoryStorage(memoryDir)
}

export function loadMemoryEntries(memoryDir: string): MemoryEntry[] {
  if (!existsSync(memoryDir)) return []
  const dailyEntries = readdirSync(memoryDir)
    .filter(isDailyLogName)
    .sort()
    .reverse()
    .flatMap((name) => parseDailyEntriesFromFile(resolve(memoryDir, name)).reverse())
  const legacyEntries = loadLegacyMemoryEntries(memoryDir)
  const entries = [...dailyEntries, ...legacyEntries]
  const seen = new Set<string>()
  return entries.filter((entry) => {
    if (!entry.id || seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
}

export function loadMemoryIndex(memoryDir: string): MemoryItem[] {
  return loadMemoryEntries(memoryDir)
    .filter((entry) => entry.kind === "memory")
    .map(({ id, title, tags, createdAt, file }) => ({
      id,
      title,
      tags,
      createdAt,
      file,
    }))
}

export function saveMemoryIndex(memoryDir: string, items: MemoryItem[]) {
  const indexPath = getLegacyIndexPath(memoryDir)
  if (!items.length) {
    if (existsSync(indexPath)) {
      unlinkSync(indexPath)
    }
    return
  }
  writeFileSync(indexPath, JSON.stringify({ items }, null, 2))
}

export function addMemory(
  memoryDir: string,
  payload: { title: string; content: string; tags?: string[] },
): StoredMemory {
  ensureMemoryDir(memoryDir)
  const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const createdAt = new Date().toISOString()
  const title = payload.title.trim() || "未命名记忆"
  const content = normalizeMemoryBody(payload.content)
  const tags = normalizeTags(payload.tags)
  const dateKey = formatLocalDate(new Date(createdAt))
  const file = appendMemoryEntry(memoryDir, {
    id,
    title,
    tags,
    createdAt,
    file: getDailyLogPath(memoryDir, dateKey),
    content,
    kind: "memory",
    dateKey,
  })

  return { id, file, createdAt }
}

export function isExplicitMemoryRequest(content: string) {
  const text = content.trim()
  if (!text) return false
  return /记住|记下来|先记下|帮我记下|请记住|存一下|保存一下|以后按这个|回头按这个|remember this|note this down|keep this in mind/i.test(
    text,
  )
}

function inferMemoryTitle(userContent: string, assistantContent: string) {
  const combined = `${userContent}\n${assistantContent}`
  if (/系统|环境|toolchain|工具链|开发机/i.test(combined)) {
    return "系统环境状态"
  }
  if (/偏好|习惯|风格|口味/i.test(combined)) {
    return "用户偏好"
  }
  if (/待办|提醒|任务|todo/i.test(combined)) {
    return "会话任务约定"
  }
  return "会话记忆"
}

export function didToolTraceRemember(
  trace: Array<{
    role?: string
    metadata?: Record<string, unknown>
    tool_calls?: Array<{ function?: { name?: string } }>
  }> = [],
) {
  return trace.some((entry) => {
    const toolName = typeof entry.metadata?.toolName === "string"
      ? entry.metadata.toolName
      : ""
    if (toolName === "Remember") return true
    return Array.isArray(entry.tool_calls)
      ? entry.tool_calls.some((call) => call?.function?.name === "Remember")
      : false
  })
}

export function rememberConversationExchange(options: {
  memoryDir: string
  conversationId: string
  userContent: string
  assistantContent: string
  tags?: string[]
}) {
  const assistantContent = normalizeMemoryBody(options.assistantContent)
  if (!assistantContent) return null
  ensureMemoryDir(options.memoryDir)
  const title = inferMemoryTitle(options.userContent, assistantContent)
  const content = normalizeMemoryBody(
    [
      `Conversation: ${options.conversationId}`,
      "",
      "User request:",
      options.userContent.trim(),
      "",
      "Remembered state:",
      assistantContent,
    ].join("\n"),
  )
  const existing = loadMemoryEntries(options.memoryDir).find((entry) => {
    if (entry.kind !== "memory") return false
    if (entry.title !== title) return false
    return normalizeMemoryBody(entry.content) === content
  })
  if (existing) {
    return {
      id: existing.id,
      file: existing.file,
      createdAt: existing.createdAt,
      deduplicated: true,
    } satisfies StoredMemory
  }
  return addMemory(options.memoryDir, {
    title,
    content,
    tags: Array.from(
      new Set(["auto-memory", `conversation:${options.conversationId}`, ...(options.tags || [])]),
    ),
  })
}

function stripMemoryFileHeading(content: string) {
  return content.replace(/^#\s*MEMORY\.md\s*/i, "").trim()
}

function summarizeMemoryEntry(entry: MemoryEntry, maxChars = 160) {
  const preview = entry.content.replace(/\s+/g, " ").trim()
  if (preview.length <= maxChars) return preview
  return `${preview.slice(0, maxChars - 3)}...`
}

export function renderMemoryContext(memoryDir: string, maxItems = 12): string {
  ensureMemoryDir(memoryDir)
  const sections: string[] = []
  const memoryPath = getMemoryFilePath(memoryDir)
  const longTerm = stripMemoryFileHeading(readFileSync(memoryPath, "utf-8"))
  if (longTerm) {
    sections.push(["长期记忆：", longTerm].join("\n"))
  }

  const recent = loadMemoryEntries(memoryDir)
    .filter((entry) => entry.kind === "memory")
    .slice(0, maxItems)
  if (recent.length) {
    sections.push(
      [
        "最近记忆日志：",
        ...recent.map((entry) => {
          const tagText = entry.tags.length ? ` [${entry.tags.join(", ")}]` : ""
          return `- ${entry.title}${tagText}: ${summarizeMemoryEntry(entry)}`
        }),
      ].join("\n"),
    )
  }

  return sections.join("\n\n").trim()
}

export function saveConversationSummary(
  memoryDir: string,
  conversationId: string,
  summary: string,
) {
  ensureMemoryDir(memoryDir)
  const createdAt = new Date().toISOString()
  const dateKey = formatLocalDate(new Date(createdAt))
  const path = appendMemoryEntry(memoryDir, {
    id: `summary-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: `会话摘要 ${conversationId}`,
    tags: ["summary", `conversation:${conversationId}`],
    createdAt,
    file: getDailyLogPath(memoryDir, dateKey),
    content: normalizeMemoryBody(summary),
    kind: "summary",
    conversationId,
    dateKey,
  })
  return path
}

export function loadLatestConversationSummary(memoryDir: string, conversationId: string) {
  return (
    loadMemoryEntries(memoryDir).find((entry) => {
      if (entry.kind !== "summary") return false
      return entry.conversationId === conversationId
    }) || null
  )
}

export function removeMemoryEntries(
  memoryDir: string,
  predicate: (entry: MemoryEntry) => boolean,
) {
  ensureMemoryDir(memoryDir)
  const removed: MemoryEntry[] = []
  const dailyFiles = readdirSync(memoryDir)
    .filter(isDailyLogName)
    .sort()

  dailyFiles.forEach((name) => {
    const file = resolve(memoryDir, name)
    const entries = parseDailyEntriesFromFile(file)
    const kept = entries.filter((entry) => {
      const shouldRemove = predicate(entry)
      if (shouldRemove) {
        removed.push(entry)
      }
      return !shouldRemove
    })
    if (!removed.length && entries.length === kept.length) {
      return
    }
    if (!kept.length) {
      unlinkSync(file)
      return
    }
    const next = [
      `# ${name.replace(/\.md$/, "")}`,
      ...kept.flatMap((keptEntry) => ["", serializeMemoryEntry(keptEntry)]),
    ]
      .join("\n")
      .trimEnd() + "\n"
    writeFileSync(file, next)
  })

  const legacyEntries = loadLegacyMemoryEntries(memoryDir)
  if (legacyEntries.length) {
    const keptLegacy = legacyEntries.filter((entry) => !predicate(entry))
    legacyEntries
      .filter((entry) => predicate(entry))
      .forEach((entry) => {
        removed.push(entry)
        if (entry.file && existsSync(entry.file)) {
          unlinkSync(entry.file)
        }
      })
    saveMemoryIndex(
      memoryDir,
      keptLegacy.map(({ id, title, tags, createdAt, file }) => ({
        id,
        title,
        tags,
        createdAt,
        file,
      })),
    )
  }

  return removed
}

export function resetLongTermMemory(memoryDir: string) {
  ensureMemoryDir(memoryDir)
  const path = getMemoryFilePath(memoryDir)
  writeFileSync(path, DEFAULT_MEMORY_FILE_CONTENT)
  return path
}
