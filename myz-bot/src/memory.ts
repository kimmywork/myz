import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

export interface MemoryItem {
  id: string
  title: string
  tags: string[]
  createdAt: string
  file: string
}

export function ensureMemoryDir(memoryDir: string) {
  const notesDir = resolve(memoryDir, "notes")
  if (!existsSync(notesDir)) {
    mkdirSync(notesDir, { recursive: true })
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
) {
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
