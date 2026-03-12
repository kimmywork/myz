import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { resolve, join, relative, dirname } from "node:path"
import { exec } from "node:child_process"
import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { ToolExecutionResult } from "@myz/ai-core/types"
import { addMemory } from "./memory"
import { assertInsideWorkspace, validateCommand } from "./guardrails"
import { parseSkillsPath, listSkills, readSkillFile, type SkillSource } from "./skills"

const textBlock = (text: string): ToolExecutionResult => ({
  content: [{ type: "text", text }],
})

function errorBlock(text: string): ToolExecutionResult {
  return { content: [{ type: "text", text }], isError: true }
}

function resolveVirtualPath(options: {
  rawPath: string
  workspaceRoot: string
  skillSources: SkillSource[]
  memoryDir: string
  conversationsDir: string
}) {
  const raw = options.rawPath || ""
  if (!raw) {
    return {
      kind: "path" as const,
      path: assertInsideWorkspace(options.workspaceRoot, options.workspaceRoot),
    }
  }

  const normalized = raw.startsWith("/") ? raw : `/${raw}`
  if (normalized.startsWith("/skills")) {
    const info = parseSkillsPath(
      normalized,
      options.skillSources.map((source) => source.id),
    )
    if (!info) return null
    if (info.kind === "root") return { kind: "skills-root" as const }
    if (info.kind === "source") {
      return { kind: "skills-source" as const, sourceId: info.sourceId }
    }
    return {
      kind: "skill-file" as const,
      sourceId: info.sourceId,
      skillName: info.skillName,
      filePath: info.filePath || "SKILL.md",
    }
  }

  if (normalized.startsWith("/memory")) {
    const next = normalized.replace(/^\/memory\/?/, "")
    const target = resolve(options.memoryDir, next)
    return { kind: "path" as const, path: assertInsideWorkspace(target, options.workspaceRoot) }
  }

  if (normalized.startsWith("/conversations")) {
    const next = normalized.replace(/^\/conversations\/?/, "")
    const target = resolve(options.conversationsDir, next)
    return { kind: "path" as const, path: assertInsideWorkspace(target, options.workspaceRoot) }
  }

  const target = resolve(options.workspaceRoot, normalized.replace(/^\/+/, ""))
  return { kind: "path" as const, path: assertInsideWorkspace(target, options.workspaceRoot) }
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

export function createLocalTools(options: {
  workspaceRoot: string
  skillSources: SkillSource[]
  memoryDir: string
  conversationsDir: string
}) {
  const definitions: Tool[] = [
    {
      name: "List",
      description: "列出目录下的文件（可传 path）。支持 /skills /memory /conversations 虚拟路径。",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
      },
    },
    {
      name: "Read",
      description: "读取文件内容（支持 /skills 路径）。",
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
      description: "写入文件内容（支持 /memory /conversations 路径）。",
      inputSchema: {
        type: "object",
        required: ["path", "content"],
        properties: {
          path: { type: "string" },
          content: { type: "string" },
          append: { type: "boolean" },
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
      description: "按 glob 模式匹配文件路径（默认相对 workspaceRoot）。",
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
      description: "在 workspaceRoot 下执行命令（带 guardrail）。",
      inputSchema: {
        type: "object",
        required: ["command"],
        properties: {
          command: { type: "string" },
          timeoutMs: { type: "integer" },
        },
      },
    },
    {
      name: "Remember",
      description: "写入共享记忆（memory/notes）。",
      inputSchema: {
        type: "object",
        required: ["title", "content"],
        properties: {
          title: { type: "string" },
          content: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    },
  ]

  const handlers: Record<string, (args: Record<string, unknown>) => Promise<ToolExecutionResult> | ToolExecutionResult> = {
    List: async (args) => {
      const rawPath = typeof args.path === "string" ? args.path : "/"
      const resolved = resolveVirtualPath({
        rawPath,
        workspaceRoot: options.workspaceRoot,
        skillSources: options.skillSources,
        memoryDir: options.memoryDir,
        conversationsDir: options.conversationsDir,
      })
      if (!resolved) return errorBlock("路径无效")
      if (resolved.kind === "skills-root") {
        const skills = listSkills(options.skillSources)
        if (!skills.length) return textBlock("暂无技能")
        return textBlock(
          skills
            .map(
              (skill) =>
                `- ${skill.sourceId}/${skill.name}: ${skill.description || ""}`.trim(),
            )
            .join("\n"),
        )
      }
      if (resolved.kind === "skills-source") {
        const skills = listSkills(options.skillSources).filter(
          (skill) => skill.sourceId === resolved.sourceId,
        )
        if (!skills.length) return textBlock("暂无技能")
        return textBlock(
          skills
            .map(
              (skill) =>
                `- ${skill.sourceId}/${skill.name}: ${skill.description || ""}`.trim(),
            )
            .join("\n"),
        )
      }
      if (resolved.kind === "skill-file") {
        return errorBlock("请指定 /skills/<source>/<name>/... 文件路径")
      }
      if (!existsSync(resolved.path)) return errorBlock("路径不存在")
      const entries = readdirSync(resolved.path)
      return textBlock(entries.join("\n"))
    },
    Read: async (args) => {
      const rawPath = typeof args.path === "string" ? args.path : ""
      if (!rawPath) return errorBlock("path 必填")
      const resolved = resolveVirtualPath({
        rawPath,
        workspaceRoot: options.workspaceRoot,
        skillSources: options.skillSources,
        memoryDir: options.memoryDir,
        conversationsDir: options.conversationsDir,
      })
      if (!resolved) return errorBlock("路径无效")
      if (resolved.kind === "skills-root") {
        return errorBlock("请使用 /skills/<source>/<name>/SKILL.md")
      }
      if (resolved.kind === "skills-source") {
        return errorBlock("请使用 /skills/<source>/<name>/SKILL.md")
      }
      if (resolved.kind === "skill-file") {
        try {
          const content = readSkillFile(
            options.skillSources,
            resolved.skillName,
            resolved.filePath,
            resolved.sourceId,
          )
          return textBlock(content)
        } catch (error) {
          return errorBlock((error as Error).message)
        }
      }
      if (!existsSync(resolved.path)) return errorBlock("路径不存在")
      const content = readFileSync(resolved.path, "utf-8")
      return textBlock(content)
    },
    Write: async (args) => {
      const rawPath = typeof args.path === "string" ? args.path : ""
      const content = typeof args.content === "string" ? args.content : ""
      const append = Boolean(args.append)
      if (!rawPath) return errorBlock("path 必填")
      const resolved = resolveVirtualPath({
        rawPath,
        workspaceRoot: options.workspaceRoot,
        skillSources: options.skillSources,
        memoryDir: options.memoryDir,
        conversationsDir: options.conversationsDir,
      })
      if (!resolved || resolved.kind !== "path") {
        return errorBlock("路径无效或不允许写入")
      }
      mkdirSync(dirname(resolved.path), { recursive: true })
      const existing = existsSync(resolved.path) ? readFileSync(resolved.path, "utf-8") : ""
      const next = append ? existing + content : content
      writeFileSync(resolved.path, next)
      return textBlock("写入完成")
    },
    Edit: async (args) => {
      const rawPath = typeof args.path === "string" ? args.path : ""
      const oldText = typeof args.oldText === "string" ? args.oldText : ""
      const newText = typeof args.newText === "string" ? args.newText : ""
      const replaceAll = Boolean(args.replaceAll)
      if (!rawPath) return errorBlock("path 必填")
      const resolved = resolveVirtualPath({
        rawPath,
        workspaceRoot: options.workspaceRoot,
        skillSources: options.skillSources,
        memoryDir: options.memoryDir,
        conversationsDir: options.conversationsDir,
      })
      if (!resolved || resolved.kind !== "path") {
        return errorBlock("路径无效或不允许修改")
      }
      if (!existsSync(resolved.path)) return errorBlock("路径不存在")
      const content = readFileSync(resolved.path, "utf-8")
      if (!content.includes(oldText)) {
        return errorBlock("未找到 oldText")
      }
      const next = replaceAll ? content.split(oldText).join(newText) : content.replace(oldText, newText)
      writeFileSync(resolved.path, next)
      return textBlock("替换完成")
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
      const guard = validateCommand(command, options.workspaceRoot)
      if (!guard.ok) return errorBlock(`命令被拒绝: ${guard.reason}`)
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
    Remember: async (args) => {
      const title = typeof args.title === "string" ? args.title : ""
      const content = typeof args.content === "string" ? args.content : ""
      if (!title || !content) return errorBlock("title/content 必填")
      const tags = Array.isArray(args.tags) ? args.tags.map((t) => String(t)) : []
      const result = addMemory(options.memoryDir, { title, content, tags })
      return textBlock(`记忆已保存: ${result.id}`)
    },
  }

  return { definitions, handlers }
}
