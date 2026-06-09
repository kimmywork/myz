import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { resolve, join, relative, dirname } from "node:path"
import { exec } from "node:child_process"
import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { ToolExecutionResult } from "@myz/ai-core/types"
import type { ChatChannelClient } from "./chatChannel"
import {
  formatAgentsNotice,
  readNearestAgentsForTarget,
  readWorkspaceAgentsFile,
} from "./agentsContext"
import {
  appendMessage,
  createAssistantMessage,
  createUserMessage,
  ensureSessionDir,
  loadSessionMetadata,
} from "./sessions"
import {
  isPathAllowed,
  isCommandAllowed,
  validateCommand,
  type AccessPolicy,
} from "./guardrails"
import { listSkills, type SkillSource } from "./skills"
import type { ChatMessage } from "./chatChannel"

const textBlock = (text: string): ToolExecutionResult => ({
  content: [{ type: "text", text }],
})

function errorBlock(text: string): ToolExecutionResult {
  return { content: [{ type: "text", text }], isError: true }
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function withStructuredData(text: string, data: unknown) {
  return [text, formatJson(data)].filter(Boolean).join("\n\n")
}

function withAgentsContext(options: {
  workspaceRoot: string
  targetPath: string
  body: string
  bodyPath?: string
}) {
  const agents = readNearestAgentsForTarget({
    workspaceRoot: options.workspaceRoot,
    targetPath: options.targetPath,
  })
  const workspaceAgents = readWorkspaceAgentsFile(options.workspaceRoot)
  const bodyPath = options.bodyPath ? resolve(options.bodyPath) : ""
  const nearestAgentsPath = agents.path ? resolve(agents.path) : ""
  const workspaceAgentsPath = workspaceAgents.path ? resolve(workspaceAgents.path) : ""
  const isWorkspaceRootAgents =
    Boolean(nearestAgentsPath) && nearestAgentsPath === workspaceAgentsPath
  const isReadingAgentsFile =
    Boolean(bodyPath) && Boolean(nearestAgentsPath) && bodyPath === nearestAgentsPath
  if (isWorkspaceRootAgents || isReadingAgentsFile) {
    return options.body
  }
  const notice = formatAgentsNotice({
    relativePath: agents.relativePath,
    content: agents.content,
  })
  return [notice, options.body].filter(Boolean).join("\n\n")
}


function walkDir(root: string, maxEntries = 2000) {
  const results: string[] = []
  const stack = [root]
  while (stack.length) {
    const dir = stack.pop()
    if (!dir) continue
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      let stat
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        stack.push(full)
      } else if (stat.isFile()) {
        results.push(full)
        if (results.length >= maxEntries) return results
      }
    }
  }
  return results
}

function globToRegex(pattern: string) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::::DOUBLE_STAR::::")
    .replace(/\*/g, "[^/]*")
    .replace(/::::DOUBLE_STAR::::/g, ".*")
  return new RegExp(`^${escaped}$`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function createLocalTools(options: {
  workspaceRoot: string
  runtimeRoot?: string
  skillSources: SkillSource[]
  skillAllowlist?: string[]
  skillDenylist?: string[]
  toolAllowlist?: string[]
  toolDenylist?: string[]
  memoryDir: string
  knowledgeDir?: string
  sessionsDir: string
  attachmentsDir?: string
  channel?: Pick<ChatChannelClient<ChatMessage>, "sendMessage">
  accessPolicy?: AccessPolicy
}) {
  const runtimeRoot = options.runtimeRoot || options.workspaceRoot
  const accessPolicy = options.accessPolicy || {}

  const allDefinitions: Tool[] = [
    {
      name: "List",
      description: "列出目录下的文件（默认工作区根目录，可传 path）。",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
      },
    },
    {
      name: "Read",
      description: "读取文件内容（默认工作区根目录）。",
      inputSchema: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string" },
        },
      },
    },
    {
      name: "Write",
      description: "写入一个或多个文件内容（默认工作区根目录）。可用 path/content 写单文件，或用 files 数组批量写入。",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          append: { type: "boolean" },
          files: {
            type: "array",
            items: {
              type: "object",
              required: ["path", "content"],
              properties: {
                path: { type: "string" },
                content: { type: "string" },
                append: { type: "boolean" },
              },
            },
          },
        },
      },
    },
    {
      name: "Edit",
      description: "替换文件内容（oldText -> newText）。",
      inputSchema: {
        type: "object",
        required: ["path", "oldText", "newText"],
        properties: {
          path: { type: "string" },
          oldText: { type: "string" },
          newText: { type: "string" },
          replaceAll: { type: "boolean" },
        },
      },
    },
    {
      name: "Glob",
      description: "按 glob 模式匹配文件路径（默认相对工作区根目录）。",
      inputSchema: {
        type: "object",
        required: ["pattern"],
        properties: {
          pattern: { type: "string" },
          maxEntries: { type: "integer" },
        },
      },
    },
    {
      name: "Run",
      description: "在工作区下执行命令（带 guardrail）。",
      inputSchema: {
        type: "object",
        required: ["command"],
        properties: {
          command: { type: "string" },
          timeoutMs: { type: "integer" },
        },
      },
    },
  ]

  const allHandlers: Record<string, (args: Record<string, unknown>) => Promise<ToolExecutionResult> | ToolExecutionResult> = {
    List: async (args) => {
      const rawPath = typeof args.path === "string" ? args.path : ""
      const targetPath = rawPath
        ? resolve(options.workspaceRoot, rawPath)
        : options.workspaceRoot

      if (!isPathAllowed(targetPath, accessPolicy, options.workspaceRoot)) {
        return errorBlock(`路径不在允许范围内: ${targetPath}`)
      }

      try {
        const stat = statSync(targetPath)
        if (!stat.isDirectory()) {
          return textBlock(targetPath)
        }
        const entries = readdirSync(targetPath)
        return textBlock(entries.join("\n"))
      } catch (error) {
        return errorBlock(`无法列出目录: ${(error as Error).message}`)
      }
    },
    Read: async (args) => {
      const rawPath = typeof args.path === "string" ? args.path : ""
      if (!rawPath) return errorBlock("path 必填")

      const targetPath = resolve(options.workspaceRoot, rawPath)
      if (!isPathAllowed(targetPath, accessPolicy, options.workspaceRoot)) {
        return errorBlock(`路径不在允许范围内: ${targetPath}`)
      }

      if (!existsSync(targetPath)) return errorBlock("路径不存在")

      try {
        const content = readFileSync(targetPath, "utf-8")
        return textBlock(
          withAgentsContext({
            workspaceRoot: options.workspaceRoot,
            targetPath: dirname(targetPath),
            bodyPath: targetPath,
            body: content,
          }),
        )
      } catch (error) {
        return errorBlock(`读取失败: ${(error as Error).message}`)
      }
    },
    Write: async (args) => {
      const rawPath = typeof args.path === "string" ? args.path : ""
      const content = typeof args.content === "string" ? args.content : ""
      const append = Boolean(args.append)

      if (!rawPath) return errorBlock("path 必填")

      const targetPath = resolve(options.workspaceRoot, rawPath)
      if (!isPathAllowed(targetPath, accessPolicy, options.workspaceRoot)) {
        return errorBlock(`路径不在允许范围内: ${targetPath}`)
      }

      try {
        mkdirSync(dirname(targetPath), { recursive: true })
        const existing = existsSync(targetPath) ? readFileSync(targetPath, "utf-8") : ""
        const next = append ? existing + content : content
        writeFileSync(targetPath, next)
        return textBlock("写入完成")
      } catch (error) {
        return errorBlock(`写入失败: ${(error as Error).message}`)
      }
    },
    Edit: async (args) => {
      const rawPath = typeof args.path === "string" ? args.path : ""
      const oldText = typeof args.oldText === "string" ? args.oldText : ""
      const newText = typeof args.newText === "string" ? args.newText : ""
      const replaceAll = Boolean(args.replaceAll)

      if (!rawPath) return errorBlock("path 必填")
      if (!oldText) return errorBlock("oldText 必填")

      const targetPath = resolve(options.workspaceRoot, rawPath)
      if (!isPathAllowed(targetPath, accessPolicy, options.workspaceRoot)) {
        return errorBlock(`路径不在允许范围内: ${targetPath}`)
      }

      if (!existsSync(targetPath)) return errorBlock("路径不存在")

      try {
        const content = readFileSync(targetPath, "utf-8")
        if (!content.includes(oldText)) {
          return errorBlock("未找到 oldText")
        }
        const next = replaceAll ? content.split(oldText).join(newText) : content.replace(oldText, newText)
        writeFileSync(targetPath, next)
        return textBlock("替换完成")
      } catch (error) {
        return errorBlock(`替换失败: ${(error as Error).message}`)
      }
    },
    Glob: async (args) => {
      const pattern = typeof args.pattern === "string" ? args.pattern : ""
      if (!pattern) return errorBlock("pattern 必填")

      const maxEntries = typeof args.maxEntries === "number" ? Math.max(1, Math.min(5000, args.maxEntries)) : 2000
      const regex = globToRegex(pattern.replace(/\\/g, "/"))
      const files = walkDir(options.workspaceRoot, maxEntries)
      const matched = files
        .map((file) => relative(options.workspaceRoot, file).replace(/\\/g, "/"))
        .filter((file) => regex.test(file))
      return textBlock(matched.join("\n"))
    },
    Run: async (args) => {
      const command = typeof args.command === "string" ? args.command : ""
      const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 60000

      if (!command) return errorBlock("command 必填")

      const guard = validateCommand(command, options.workspaceRoot, accessPolicy)
      if (!guard.ok) {
        return errorBlock(`命令被拒绝: ${guard.reason}`)
      }

      return new Promise((resolvePromise) => {
        exec(
          command,
          { cwd: options.workspaceRoot, timeout: timeoutMs, maxBuffer: 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error) {
              resolvePromise(
                errorBlock(
                  `命令失败: ${error.message}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
                ),
              )
              return
            }
            resolvePromise(textBlock(`STDOUT:\n${stdout}\nSTDERR:\n${stderr}`))
          },
        )
      })
    },
  }

  const normalizeName = (value: string) => value.trim().toLowerCase()
  const allowlist =
    options.toolAllowlist && options.toolAllowlist.length
      ? new Set(options.toolAllowlist.map(normalizeName))
      : null
  const denylist = new Set((options.toolDenylist || []).map(normalizeName))
  const isEnabled = (name: string) => {
    const normalized = normalizeName(name)
    if (denylist.has(normalized)) return false
    if (!allowlist) return true
    return allowlist.has(normalized)
  }

  const definitions = allDefinitions.filter((definition) => isEnabled(definition.name))
  const handlers = Object.fromEntries(
    Object.entries(allHandlers).filter(([name]) => isEnabled(name)),
  )

  return { definitions, handlers }
}
