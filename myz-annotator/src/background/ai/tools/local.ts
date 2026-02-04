import { ContentBlock } from "../../mcp_schema.js"
import { LOCAL_TOOL_DEFINITIONS } from "./localDefinitions.js"
import { executeSandboxedCode } from "./codeExecution.js"
import { getSkillFile, listSkillFiles, listSkills } from "../skills/storage.js"
import { listFiles, readFile, writeFile } from "../vfs.js"

export interface ToolExecutionResult {
  content: ContentBlock[]
  data?: any
  isError?: boolean
}

function normalizeLimit(value: any, fallback = 20, max = 50): number {
  if (typeof value !== "number") return fallback
  return Math.max(1, Math.min(max, Math.floor(value)))
}

function normalizeSearchEngine(value: any): "bing" | "google" {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : ""
  return raw === "google" ? "google" : "bing"
}

function normalizeSearchQuery(value: any) {
  return typeof value === "string" ? value.trim() : ""
}

function buildSearchUrl(engine: "bing" | "google", query: string) {
  const encoded = encodeURIComponent(query)
  if (engine === "google") {
    return `https://www.google.com/search?q=${encoded}&hl=zh-CN`
  }
  return `https://www.bing.com/search?q=${encoded}&setlang=zh-hans`
}

function normalizeHttpUrl(value: any) {
  const raw = typeof value === "string" ? value.trim() : ""
  if (!raw) return ""
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return ""
    }
    return parsed.toString()
  } catch {
    return ""
  }
}

function normalizeSkillName(value: any) {
  return typeof value === "string" ? value.trim() : ""
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

function parseSkillsPath(input: any): {
  kind: "root" | "skill"
  skillName?: string
  filePath?: string
} | null {
  const normalized = normalizePath(input)
  if (!normalized) return null
  if (!normalized.startsWith("skills")) return null
  const rest = normalized.slice("skills".length).replace(/^\/+/, "")
  if (!rest) {
    return { kind: "root" }
  }
  const parts = rest.split("/").filter(Boolean)
  if (!parts.length) {
    return { kind: "root" }
  }
  const skillName = parts[0]
  const filePath = parts.slice(1).join("/")
  return { kind: "skill", skillName, filePath }
}

async function resolveEnabledSkill(input: any) {
  const name = normalizeSkillName(input)
  if (!name) return null
  const skills = await listSkills()
  const enabled = skills.filter((skill) => skill.enabled)
  const match =
    enabled.find((skill) => skill.id === name) ||
    enabled.find((skill) => skill.name === name)
  return match || null
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function isExpectedSearchUrl(engine: "bing" | "google", url: string) {
  if (!url) return false
  try {
    const parsed = new URL(url)
    const host = parsed.host.toLowerCase()
    const path = parsed.pathname || ""
    if (engine === "bing") {
      return host.endsWith("bing.com") && path.startsWith("/search")
    }
    return host.endsWith("google.com") && path.startsWith("/search")
  } catch {
    return false
  }
}

async function waitForSearchTabReady(options: {
  tabId: number
  engine: "bing" | "google"
  timeoutMs?: number
}) {
  const { tabId, engine, timeoutMs = 20000 } = options
  if (!tabId) throw new Error("tabId is required")

  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null)
    const url = typeof tab?.url === "string" ? tab.url : ""
    const status = tab?.status || ""
    if (status === "complete" && isExpectedSearchUrl(engine, url)) {
      return
    }
    await delay(200)
  }
  throw new Error("Search page load timeout")
}

function isNoReceiverError(error: any) {
  const message = String(error?.message || error || "")
  return (
    message.includes("Receiving end does not exist") ||
    message.includes("Could not establish connection")
  )
}

async function requestSearchResultsFromTab(options: {
  tabId: number
  engine: "bing" | "google"
  limit: number
}) {
  const { tabId, engine, limit } = options
  let lastError: any = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, {
        type: "myz:extractSearchResults",
        payload: { engine, limit },
      })
    } catch (error) {
      lastError = error
      if (!isNoReceiverError(error)) {
        throw error
      }
      await delay(200 + attempt * 80)
    }
  }
  throw lastError || new Error("Failed to extract search results")
}

async function waitForHttpTabReady(options: { tabId: number; timeoutMs?: number }) {
  const { tabId, timeoutMs = 20000 } = options
  if (!tabId) throw new Error("tabId is required")

  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null)
    const url = typeof tab?.url === "string" ? tab.url : ""
    const pendingUrl = typeof tab?.pendingUrl === "string" ? tab.pendingUrl : ""
    const resolvedUrl = url || pendingUrl
    if (resolvedUrl.startsWith("http")) {
      return
    }
    await delay(200)
  }
  throw new Error("Page navigation timeout")
}

async function requestPrimaryContentFromTab(options: {
  tabId: number
  maxChars: number
}) {
  const { tabId, maxChars } = options
  let lastError: any = null
  for (let attempt = 0; attempt < 18; attempt += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, {
        type: "myz:extractPrimaryContent",
        payload: { maxChars },
      })
    } catch (error) {
      lastError = error
      if (!isNoReceiverError(error)) {
        throw error
      }
      await delay(220 + attempt * 90)
    }
  }
  throw lastError || new Error("Failed to extract page content")
}

function truncateText(value: any, maxLen = 280) {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
  if (!text) return ""
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text
}

const LOCAL_TOOL_HANDLERS: Record<string, (args?: any) => Promise<ToolExecutionResult>> =
  {
    "myz-web-search": async (args: any = {}) => {
      const query = normalizeSearchQuery(args.query)
      const engine = normalizeSearchEngine(args.engine)
      const limit = normalizeLimit(args.limit, 5, 10)

      if (!query) {
        return {
          content: [{ type: "text", text: "请输入要搜索的关键词。" }],
          data: [],
        }
      }

      const url = buildSearchUrl(engine, query)
      let tabId: number | null = null
      try {
        const tab = await chrome.tabs.create({ url, active: false })
        tabId = typeof tab?.id === "number" ? tab.id : null
        if (!tabId) {
          throw new Error("Failed to open search tab")
        }

        await waitForSearchTabReady({ tabId, engine, timeoutMs: 25000 })

        const resp = await requestSearchResultsFromTab({ tabId, engine, limit })
        const payload = (resp && (resp.data || resp)) || {}
        const results = Array.isArray(payload?.results) ? payload.results : []

        const lines = results
          .slice(0, limit)
          .map((item: any, index: number) => {
            const title = truncateText(item?.title, 120) || "Untitled"
            const link = typeof item?.url === "string" ? item.url : ""
            const snippet = truncateText(item?.snippet, 240)
            const header = link ? `${index + 1}. [${title}](${link})` : `${index + 1}. ${title}`
            return snippet ? `${header}\n   ${snippet}` : header
          })

        const text =
          lines.length > 0
            ? `搜索引擎：${engine}\n关键词：${query}\n\n结果：\n${lines.join("\n")}`
            : `没有找到结果（${engine} / ${query}）。`

        return { content: [{ type: "text", text }], data: results.slice(0, limit) }
      } finally {
        if (typeof tabId === "number") {
          await chrome.tabs.remove(tabId).catch(() => {})
        }
      }
    },
    "myz-fetch-page": async (args: any = {}) => {
      const url = normalizeHttpUrl(args.url)
      const maxChars = normalizeLimit(args.maxChars, 15000, 60000)

      if (!url) {
        return {
          content: [{ type: "text", text: "请输入有效的 http/https URL。" }],
          data: null,
        }
      }

      let tabId: number | null = null
      try {
        const tab = await chrome.tabs.create({ url, active: false })
        tabId = typeof tab?.id === "number" ? tab.id : null
        if (!tabId) {
          throw new Error("Failed to open page tab")
        }

        await waitForHttpTabReady({ tabId, timeoutMs: 25000 })
        const resp = await requestPrimaryContentFromTab({ tabId, maxChars })
        const payload = (resp && (resp.data || resp)) || {}

        const title = typeof payload?.title === "string" ? payload.title : ""
        const finalUrl = typeof payload?.url === "string" ? payload.url : url
        const text = typeof payload?.text === "string" ? payload.text : ""
        const truncated = Boolean(payload?.truncated)

        const preview = truncateText(text, 900)
        const summaryLines = [
          `URL: ${finalUrl}`,
          title ? `标题: ${title}` : "",
          `字数: ${Number(payload?.wordCount) || 0} / chunks: ${Number(payload?.chunkCount) || 0}`,
          truncated ? "⚠️ 内容已截断" : "",
        ].filter(Boolean)

        const contentText =
          text.trim().length > 0
            ? `${summaryLines.join("\n")}\n\n主体内容（节选）：\n${preview}`
            : `${summaryLines.join("\n")}\n\n未能提取到主体内容。`

        return {
          content: [{ type: "text", text: contentText }],
          data: {
            url: finalUrl,
            title,
            text,
            truncated,
            chunkCount: payload?.chunkCount || 0,
            wordCount: payload?.wordCount || 0,
          },
        }
      } finally {
        if (typeof tabId === "number") {
          await chrome.tabs.remove(tabId).catch(() => {})
        }
      }
    },
    "myz-code-execution": async (args: any = {}) => {
      try {
        const result = await executeSandboxedCode({
          code: args.code,
          timeoutMs: args.timeoutMs,
          maxResultChars: args.maxResultChars,
        })

        const displayResult =
          result.resultType === "undefined"
            ? "undefined"
            : result.resultType === "string" && result.resultText === ""
              ? "（空字符串）"
              : result.resultText

        const lines = [
          `执行成功${result.truncated ? "（结果已截断）" : ""}`,
          `类型: ${result.resultType}`,
          `结果: ${displayResult}`,
          `console.log输出结果：${
            result.consoleLogs.length ? result.consoleLogs.join("\n") : "无"
          }`,
        ]

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          data: result,
        }
      } catch (error) {
        const message = String((error as Error)?.message || error || "未知错误")
        return {
          content: [{ type: "text", text: `执行失败：${message}` }],
          data: { error: message },
          isError: true,
        }
      }
    },
    "list-files": async (args: any = {}) => {
      const dir = typeof args.dir === "string" ? args.dir.trim() : ""
      const skillsDir = parseSkillsPath(dir)
      if (skillsDir) {
        const enabledSkills = (await listSkills()).filter((skill) => skill.enabled)
        if (skillsDir.kind === "root") {
          const data = await Promise.all(
            enabledSkills.map(async (skill) => {
              const file = await getSkillFile(skill.id, "SKILL.md")
              const content = file?.content || ""
              const lines = content ? content.split(/\r?\n/).length : 0
              return {
                path: `/skills/${skill.name}/SKILL.md`,
                updatedAt: file?.updatedAt || skill.updatedAt,
                size: content.length,
                lines,
              }
            }),
          )
          const filtered = data.filter((item) => item.size > 0)
          const text =
            filtered.length > 0
              ? `技能文件列表：\n${filtered
                  .map(
                    (file, index) =>
                      `${index + 1}. ${file.path} (${file.size} chars, ${file.lines} lines)`,
                  )
                  .join("\n")}`
              : "当前没有可用的技能文件。"
          return { content: [{ type: "text", text }], data: filtered }
        }

        const skill = enabledSkills.find(
          (item) => item.id === skillsDir.skillName || item.name === skillsDir.skillName,
        )
        if (!skill) {
          return {
            content: [{ type: "text", text: "未找到指定的技能。" }],
            data: null,
            isError: true,
          }
        }
        const files = await listSkillFiles(skill.id)
        const prefix = skillsDir.filePath ? `${skillsDir.filePath.replace(/\/+$/, "")}/` : ""
        const filtered = files.filter((file) =>
          prefix ? file.path.startsWith(prefix) : true,
        )
        const data = filtered.map((file) => ({
          path: `/skills/${skill.name}/${file.path}`,
          updatedAt: file.updatedAt,
          size: file.content.length,
          lines: file.content ? file.content.split(/\r?\n/).length : 0,
        }))
        const text =
          data.length > 0
            ? `技能文件列表：\n${data
                .map(
                  (file, index) =>
                    `${index + 1}. ${file.path} (${file.size} chars, ${file.lines} lines)`,
                )
                .join("\n")}`
            : "当前目录没有文件。"
        return { content: [{ type: "text", text }], data }
      }

      const files = await listFiles(dir)
      const data = files.map((file) => ({
        path: file.path,
        updatedAt: file.updatedAt,
        size: file.content.length,
        lines: file.content ? file.content.split(/\r?\n/).length : 0,
      }))
      const text =
        data.length > 0
          ? `文件列表：\n${data
              .map(
                (file, index) =>
                  `${index + 1}. ${file.path} (${file.size} chars, ${file.lines} lines)`,
              )
              .join("\n")}`
          : "当前目录没有文件。"
      return { content: [{ type: "text", text }], data }
    },
    "read-file": async (args: any = {}) => {
      const filePath = typeof args.file_path === "string" ? args.file_path.trim() : ""
      if (!filePath) {
        return {
          content: [{ type: "text", text: "file_path 是必填项。" }],
          data: null,
          isError: true,
        }
      }
      const skillsPath = parseSkillsPath(filePath)
      if (skillsPath) {
        if (skillsPath.kind === "root" || !skillsPath.skillName) {
          return {
            content: [{ type: "text", text: "请提供 /skills/{skill}/... 路径。" }],
            data: null,
            isError: true,
          }
        }
        const skill = await resolveEnabledSkill(skillsPath.skillName)
        if (!skill) {
          return {
            content: [{ type: "text", text: "未找到指定的技能。" }],
            data: null,
            isError: true,
          }
        }
        const resolvedPath = skillsPath.filePath || "SKILL.md"
        const record = await getSkillFile(skill.id, resolvedPath)
        if (!record) {
          return {
            content: [{ type: "text", text: "未找到指定的技能文件。" }],
            data: null,
            isError: true,
          }
        }
        const allLines = record.content.split(/\r?\n/)
        const startLine =
          typeof args.line === "number" && Number.isFinite(args.line) && args.line > 0
            ? Math.floor(args.line)
            : 1
        const lineCount =
          typeof args.lines === "number" && Number.isFinite(args.lines) && args.lines > 0
            ? Math.floor(args.lines)
            : allLines.length
        const slice = allLines.slice(startLine - 1, startLine - 1 + lineCount)
        const text = slice.join("\n")
        return {
          content: [{ type: "text", text }],
          data: {
            path: `/skills/${skill.name}/${record.path}`,
            content: text,
            startLine,
            endLine: Math.min(allLines.length, startLine - 1 + lineCount),
            totalLines: allLines.length,
            updatedAt: record.updatedAt,
          },
        }
      }

      const record = await readFile(filePath)
      if (!record) {
        return {
          content: [{ type: "text", text: "未找到指定的文件。" }],
          data: null,
          isError: true,
        }
      }
      const allLines = record.content.split(/\r?\n/)
      const startLine =
        typeof args.line === "number" && Number.isFinite(args.line) && args.line > 0
          ? Math.floor(args.line)
          : 1
      const lineCount =
        typeof args.lines === "number" && Number.isFinite(args.lines) && args.lines > 0
          ? Math.floor(args.lines)
          : allLines.length
      const slice = allLines.slice(startLine - 1, startLine - 1 + lineCount)
      const text = slice.join("\n")
      return {
        content: [{ type: "text", text }],
        data: {
          path: record.path,
          content: text,
          startLine,
          endLine: Math.min(allLines.length, startLine - 1 + lineCount),
          totalLines: allLines.length,
          updatedAt: record.updatedAt,
        },
      }
    },
    "write-file": async (args: any = {}) => {
      const filePath = typeof args.file_path === "string" ? args.file_path.trim() : ""
      const text = typeof args.text === "string" ? args.text : ""
      const line =
        typeof args.line === "number" && Number.isFinite(args.line) && args.line > 0
          ? Math.floor(args.line)
          : undefined
      if (!filePath) {
        return {
          content: [{ type: "text", text: "file_path 是必填项。" }],
          data: null,
          isError: true,
        }
      }
      if (parseSkillsPath(filePath)) {
        return {
          content: [{ type: "text", text: "不允许修改 /skills 下的文件。" }],
          data: null,
          isError: true,
        }
      }
      const record = await writeFile(filePath, text, line)
      return {
        content: [
          {
            type: "text",
            text: `写入成功：${record.path} (${record.content.length} chars)`,
          },
        ],
        data: record,
      }
    },
  }

export { LOCAL_TOOL_DEFINITIONS, LOCAL_TOOL_HANDLERS }
