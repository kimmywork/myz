import { ContentBlock } from "../../mcp_schema.js"
import { getAllHighlights } from "../../storage.js"
import { MyZRecord } from "@/shared/types.js"
import { LOCAL_TOOL_DEFINITIONS } from "./localDefinitions.js"

export interface ToolExecutionResult {
  content: ContentBlock[]
  data?: any
  isError?: boolean
}

function toDateOnly(value: any): Date | null {
  if (!value) return null
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date
  } catch {
    return null
  }
}

async function readAllHighlights(): Promise<MyZRecord[]> {
  return getAllHighlights()
}

function normalizeLimit(value: any, fallback = 20, max = 50): number {
  if (typeof value !== "number") return fallback
  return Math.max(1, Math.min(max, Math.floor(value)))
}

function buildHighlightSummary(record: MyZRecord): string {
  if (!record) return ""
  const date =
    typeof record.createdAt === "string"
      ? record.createdAt.slice(0, 10)
      : new Date(record.createdAt || Date.now()).toISOString().slice(0, 10)
  const host = record.hostname || ""
  const tags = Array.isArray(record.tags) ? record.tags.join(", ") : ""
  const text = (record.text || "").replace(/\s+/g, " ").slice(0, 140)
  const note = (record.note || "").replace(/\s+/g, " ").slice(0, 100)
  const parts = [`[${date}]`, host || "unknown"]
  if (tags) parts.push(`tags: ${tags}`)
  if (text) parts.push(`“${text}”`)
  if (note) parts.push(`note: ${note}`)
  return parts.join(" · ")
}

const LOCAL_TOOL_HANDLERS: Record<string, (args?: any) => Promise<ToolExecutionResult>> =
  {
    "myz-list-hosts": async () => {
      const highlights = await readAllHighlights()
      const counts = new Map()
      highlights.forEach((h) => {
        const host = h.hostname || ""
        if (!host) return
        counts.set(host, (counts.get(host) || 0) + 1)
      })
      const sorted = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([host, count]) => ({ host, count }))
      const lines = sorted.map((item) => `${item.host}: ${item.count}`)
      const text =
        sorted.length > 0
          ? `共 ${sorted.length} 个站点：\n${lines.join("\n")}`
          : "没有找到保存的站点。"
      return { content: [{ type: "text", text }], data: sorted }
    },
    "myz-popular-tags": async (args = {}) => {
      const limit = normalizeLimit(args.limit, 20, 50)
      const highlights = await readAllHighlights()
      const counts = new Map()
      highlights.forEach((h) => {
        ;(Array.isArray(h.tags) ? h.tags : []).forEach((tag) => {
          if (typeof tag !== "string" || !tag.trim()) return
          const key = tag.trim()
          counts.set(key, (counts.get(key) || 0) + 1)
        })
      })
      const sorted = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([tag, count]) => ({ tag, count }))
      const lines = sorted.map((item) => `${item.tag}: ${item.count}`)
      const text =
        sorted.length > 0
          ? `热门标签（前 ${sorted.length}）：\n${lines.join("\n")}`
          : "没有找到标签。"
      return { content: [{ type: "text", text }], data: sorted }
    },
    "myz-search-highlights": async (args = {}) => {
      const query = typeof args.query === "string" ? args.query.trim() : ""
      const limit = normalizeLimit(args.limit, 10, 50)
      if (!query) {
        return {
          content: [{ type: "text", text: "请输入要搜索的关键词。" }],
          data: [],
        }
      }
      const needle = query.toLowerCase()
      const highlights = await readAllHighlights()
      const matches = highlights
        .filter((h) => {
          const haystack = [
            h.text || "",
            h.note || "",
            (Array.isArray(h.tags) ? h.tags.join(" ") : "") || "",
          ]
            .join(" ")
            .toLowerCase()
          return haystack.includes(needle)
        })
        .slice(0, limit)
      const text =
        matches.length > 0
          ? `找到 ${matches.length} 条匹配：\n${matches
              .map((m) => `- ${buildHighlightSummary(m)}`)
              .join("\n")}`
          : "未找到匹配的标注。"
      return { content: [{ type: "text", text }], data: matches }
    },
    "myz-filter-by-date": async (args = {}) => {
      const fromDate = toDateOnly(args.from)
      const toDate = toDateOnly(args.to)
      const limit = normalizeLimit(args.limit, 20, 50)
      const highlights = await readAllHighlights()
      const matches = highlights
        .filter((h) => {
          const date = toDateOnly(h.createdAt || (h as any).created_at || (h as any).date)
          if (!date) return false
          if (fromDate && date < fromDate) return false
          if (toDate && date > toDate) return false
          return true
        })
        .slice(0, limit)
      const text =
        matches.length > 0
          ? `筛选到 ${matches.length} 条标注：\n${matches
              .map((m) => `- ${buildHighlightSummary(m)}`)
              .join("\n")}`
          : "未找到符合日期范围的标注。"
      return { content: [{ type: "text", text }], data: matches }
    },
    "myz-filter-by-tag-or-host": async (
      args: { tags?: string[]; host?: string; limit?: number } = { tags: [] },
    ) => {
      const limit = normalizeLimit(args.limit, 20, 50)
      const tags = Array.isArray(args.tags)
        ? args.tags
            .filter((t) => typeof t === "string" && t.trim())
            .map((t) => t.trim().toLowerCase())
        : []
      const host =
        typeof args.host === "string" && args.host.trim()
          ? args.host.trim().toLowerCase()
          : ""
      const highlights = await readAllHighlights()
      const matches = highlights
        .filter((h) => {
          if (host) {
            const currentHost = (h.hostname || "").toLowerCase()
            if (!currentHost.includes(host)) return false
          }
          if (tags.length) {
            const itemTags = Array.isArray(h.tags)
              ? h.tags.map((t) => String(t).toLowerCase())
              : []
            return tags.every((tag) => itemTags.includes(tag))
          }
          return true
        })
        .slice(0, limit)
      const summaryParts = []
      if (host) summaryParts.push(`host 包含 "${host}"`)
      if (tags.length) summaryParts.push(`标签包含 ${tags.join(", ")}`)
      const summaryText = summaryParts.length ? summaryParts.join(" 且 ") : "所有标注"
      const text =
        matches.length > 0
          ? `${summaryText}，返回 ${matches.length} 条：\n${matches
              .map((m) => `- ${buildHighlightSummary(m)}`)
              .join("\n")}`
          : `未找到满足条件的标注（${summaryText}）。`
      return { content: [{ type: "text", text }], data: matches }
    },
  }

export { LOCAL_TOOL_DEFINITIONS, LOCAL_TOOL_HANDLERS }
