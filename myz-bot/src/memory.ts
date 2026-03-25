import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs"
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

export function ensureMemoryDir(memoryDir: string) {
  const notesDir = resolve(memoryDir, "notes")
  const summaryDir = resolve(memoryDir, "conversation-summaries")
  if (!existsSync(notesDir)) {
    mkdirSync(notesDir, { recursive: true })
  }
  if (!existsSync(summaryDir)) {
    mkdirSync(summaryDir, { recursive: true })
  }
  const indexFile = resolve(memoryDir, "index.json")
  if (!existsSync(indexFile)) {
    writeFileSync(indexFile, JSON.stringify({ items: [] }, null, 2))
  }
}

export function loadMemoryIndex(memoryDir: string): MemoryItem[] {
  const indexFile = resolve(memoryDir, "index.json")
  if (!existsSync(indexFile)) return []
  const parsed = JSON.parse(readFileSync(indexFile, "utf-8")) as {
    items?: MemoryItem[]
  }
  return Array.isArray(parsed.items) ? parsed.items : []
}

export function saveMemoryIndex(memoryDir: string, items: MemoryItem[]) {
  const indexFile = resolve(memoryDir, "index.json")
  writeFileSync(indexFile, JSON.stringify({ items }, null, 2))
}

export function addMemory(
  memoryDir: string,
  payload: { title: string; content: string; tags?: string[] },
): StoredMemory {
  ensureMemoryDir(memoryDir)
  const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const file = resolve(memoryDir, "notes", `${id}.md`)
  const createdAt = new Date().toISOString()
  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((t) => typeof t === "string" && t.trim())
    : []
  const title = payload.title.trim() || "未命名记忆"
  const content = payload.content.trim()
  writeFileSync(file, `# ${title}\n\n${content}\n`)

  const items = loadMemoryIndex(memoryDir)
  items.unshift({ id, title, tags, createdAt, file })
  saveMemoryIndex(memoryDir, items)

  return { id, file, createdAt }
}

export function isExplicitMemoryRequest(content: string) {
  const text = content.trim()
  if (!text) return false
  return /记住|记下来|先记下|帮我记下|请记住|存一下|保存一下|以后按这个|回头按这个|remember this|note this down|keep this in mind/i.test(
    text,
  )
}

function normalizeMemoryBody(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .trim()
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
  const items = loadMemoryIndex(options.memoryDir)
  const existing = items.find((item) => {
    if (item.title !== title) return false
    if (!existsSync(item.file)) return false
    const stored = normalizeMemoryBody(readFileSync(item.file, "utf-8"))
    return stored === `# ${title}\n\n${content}`
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

export function renderMemoryContext(
  memoryDir: string,
  maxItems = 12,
): string {
  const items = loadMemoryIndex(memoryDir)
    .filter((item) => item && typeof item.title === "string")
    .slice(0, maxItems)
  if (!items.length) return ""
  const lines = items.map((item) => {
    const tagText = item.tags.length ? ` [${item.tags.join(", ")}]` : ""
    return `- ${item.title}${tagText}`
  })
  return ["共享记忆摘要：", ...lines].join("\n")
}

export function saveConversationSummary(
  memoryDir: string,
  conversationId: string,
  summary: string,
) {
  ensureMemoryDir(memoryDir)
  const path = resolve(memoryDir, "conversation-summaries", `${conversationId}.md`)
  writeFileSync(path, `${summary.trim()}\n`)
  return path
}
