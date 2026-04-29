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
  ensureConversationDir,
  loadMetadata,
} from "./conversations"
import {
  assertInsideWorkspace,
  resolveCommandVirtualPaths,
  validateCommand,
} from "./guardrails"
import {
  createElevatedPermissionRequest,
  findAdminPrivateChatTargets,
  isPathAllowedByGrant,
} from "./elevatedPermissions"
import { parseSkillsPath, listSkills, readSkillFile, type SkillSource } from "./skills"
import {
  createScheduledTask,
  formatTasksForTool,
  listConversationTasks,
  updateScheduledTask,
} from "./tasks"
import {
  completeAllTasks,
  getTaskPlan,
  initTaskPlan,
  listUnblockedTasks,
  updateTaskItem,
  updateTaskPlanStatus,
  updateTaskStatus,
  type TaskItem,
  type TaskPlanStatus,
  type TaskPriority,
  type TaskStatus,
} from "./taskPlans"
import type { ChatMessage } from "./chatChannel"

const textBlock = (text: string): ToolExecutionResult => ({
  content: [{ type: "text", text }],
})

function errorBlock(text: string): ToolExecutionResult {
  return { content: [{ type: "text", text }], isError: true }
}

function formatJson(value: unknown, maxChars = 6000) {
  const text = JSON.stringify(value, null, 2)
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n...truncated`
}

function withStructuredData(text: string, data: unknown, maxChars = 6000) {
  return [text, formatJson(data, maxChars)].filter(Boolean).join("\n\n")
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

function resolveToolWorkspaceRoot(options: {
  workspaceRoot: string
}) {
  return options.workspaceRoot
}

function resolveConversationAttachmentsDir(options: {
  attachmentsDir: string
  conversationId?: string
}) {
  const conversationId =
    typeof options.conversationId === "string"
      ? options.conversationId.trim()
      : ""
  if (!conversationId) {
    throw new Error("当前没有会话上下文，无法访问附件")
  }
  return resolve(options.attachmentsDir, conversationId)
}

function resolveVirtualPath(options: {
  rawPath: string
  workspaceRoot: string
  skillSources: SkillSource[]
  memoryDir: string
  conversationsDir: string
  attachmentsDir: string
  conversationId?: string
  allowExternalPaths?: boolean
}) {
  const effectiveWorkspaceRoot = resolveToolWorkspaceRoot({
    workspaceRoot: options.workspaceRoot,
  })
  const raw = options.rawPath || ""
  if (!raw) {
    return {
      kind: "path" as const,
      path: options.allowExternalPaths
        ? resolve(effectiveWorkspaceRoot)
        : assertInsideWorkspace(effectiveWorkspaceRoot, options.workspaceRoot),
    }
  }

  const normalized = raw.startsWith("/") ? raw : `/${raw}`
  if (normalized === "/attachments" || normalized.startsWith("/attachments/")) {
    const next = normalized.replace(/^\/attachments\/?/, "")
    const attachmentRoot = resolveConversationAttachmentsDir({
      attachmentsDir: options.attachmentsDir,
      conversationId: options.conversationId,
    })
    const target = resolve(attachmentRoot, next)
    return {
      kind: "path" as const,
      path: options.allowExternalPaths
        ? target
        : assertInsideWorkspace(target, attachmentRoot),
    }
  }

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

  if (normalized.startsWith("/workspace")) {
    const next = normalized.replace(/^\/workspace\/?/, "")
    const target = resolve(effectiveWorkspaceRoot, next)
    return {
      kind: "path" as const,
      path: options.allowExternalPaths
        ? target
        : assertInsideWorkspace(target, options.workspaceRoot),
    }
  }

  const target = raw.startsWith("/")
    ? resolve(raw)
    : resolve(effectiveWorkspaceRoot, normalized.replace(/^\/+/, ""))
  return {
    kind: "path" as const,
    path: options.allowExternalPaths
      ? target
      : assertInsideWorkspace(target, options.workspaceRoot),
  }
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

function isAttachmentsVirtualPath(rawPath: string) {
  return /^\/attachments(?:\/|$)/.test(rawPath)
}

function parseTaskPlanStatus(value: unknown): TaskPlanStatus | undefined {
  switch (value) {
    case "planning":
    case "executing":
    case "blocked":
    case "done":
      return value
    default:
      return undefined
  }
}

function parseTaskStatus(value: unknown): TaskStatus | undefined {
  switch (value) {
    case "pending":
    case "in_progress":
    case "done":
    case "blocked":
      return value
    default:
      return undefined
  }
}

function parseTaskPriority(value: unknown): TaskPriority | undefined {
  return value === "high" || value === "low" || value === "medium"
    ? value
    : undefined
}

function parseTaskAction(value: unknown) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (!raw) return ""
  const normalized = raw.replace(/[\s-]+/g, "_")
  const aliases: Record<string, string> = {
    completeall: "complete_all",
    complete_all: "complete_all",
    list_tasks: "list",
    get_tasks: "get",
    update_task: "update",
    init_plan: "init",
  }
  const mapped = aliases[normalized] || normalized
  const allowed = new Set(["init", "update", "get", "list", "complete_all"])
  return allowed.has(mapped) ? mapped : ""
}

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
  return cleaned.length ? cleaned : []
}

function buildTaskItemPatch(
  raw: Record<string, unknown>,
): Partial<TaskItem> & { appendNote?: string } {
  const patch: Partial<TaskItem> & { appendNote?: string } = {}
  if (typeof raw.title === "string") {
    patch.title = raw.title.trim()
  }
  const status = parseTaskStatus(raw.status)
  if (status) {
    patch.status = status
  }
  const priority = parseTaskPriority(raw.priority)
  if (priority) {
    patch.priority = priority
  }
  const skills = parseStringArray(raw.skills)
  if (skills) {
    patch.skills = skills
  }
  const blockedBy = parseStringArray(raw.blockedBy)
  if (blockedBy) {
    patch.blockedBy = blockedBy
  }
  const blocks = parseStringArray(raw.blocks)
  if (blocks) {
    patch.blocks = blocks
  }
  if (typeof raw.summary === "string") {
    patch.summary = raw.summary.trim()
  }
  if (typeof raw.outcome === "string") {
    patch.outcome = raw.outcome.trim()
  }
  const notes = parseStringArray(raw.notes)
  if (notes) {
    patch.notes = notes
  }
  if (typeof raw.note === "string") {
    patch.appendNote = raw.note.trim()
  }
  return patch
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
  conversationsDir: string
  attachmentsDir?: string
  adminUsers?: string[]
  telegram?: Pick<ChatChannelClient<ChatMessage>, "sendMessage">
}) {
  const runtimeRoot = options.runtimeRoot || options.workspaceRoot
  const attachmentsDir = options.attachmentsDir || resolve(runtimeRoot, "attachments")
  function resolveWriteEntries(args: Record<string, unknown>) {
    const conversationId =
      typeof args.__conversationId === "string" ? args.__conversationId : undefined
    const files = Array.isArray(args.files)
      ? args.files.filter(isRecord)
      : []
    const writeRequests =
      files.length > 0
        ? files.map((file) => ({
            rawPath: typeof file.path === "string" ? file.path : "",
            content: typeof file.content === "string" ? file.content : "",
            append: Boolean(file.append),
          }))
        : [
            {
              rawPath: typeof args.path === "string" ? args.path : "",
              content: typeof args.content === "string" ? args.content : "",
              append: Boolean(args.append),
            },
          ]
    if (!writeRequests.length) {
      return errorBlock("path 必填")
    }

    const effectiveWorkspaceRoot = resolveToolWorkspaceRoot({
      workspaceRoot: options.workspaceRoot,
    })
    const resolvedPaths = new Set<string>()
    const entries: Array<{
      rawPath: string
      resolvedPath: string
      content: string
      append: boolean
    }> = []

    for (const request of writeRequests) {
      if (!request.rawPath) {
        return errorBlock("path 必填")
      }
      if (isAttachmentsVirtualPath(request.rawPath)) {
        return errorBlock("附件目录是只读的，不允许写入")
      }
      const resolved = resolveVirtualPath({
        rawPath: request.rawPath,
        workspaceRoot: options.workspaceRoot,
        skillSources: options.skillSources,
        memoryDir: options.memoryDir,
        conversationsDir: options.conversationsDir,
        attachmentsDir,
        conversationId,
        allowExternalPaths: true,
      })
      if (!resolved || resolved.kind !== "path") {
        return errorBlock("路径无效或不允许写入")
      }
      if (
        !isPathAllowedByGrant({
          workspaceRoot: runtimeRoot,
          access: "write",
          targetPath: resolved.path,
        }) &&
        !resolved.path.startsWith(`${effectiveWorkspaceRoot}/`) &&
        resolved.path !== effectiveWorkspaceRoot &&
        !resolved.path.startsWith(`${options.workspaceRoot}/`) &&
        resolved.path !== options.workspaceRoot
      ) {
        return requestElevatedPathPermission({
          access: "write",
          targetPath: resolved.path,
          rawTarget: request.rawPath,
          toolName: "Write",
          reason: "需要写入当前工作区之外的路径",
          conversationId,
        })
      }
      if (resolvedPaths.has(resolved.path)) {
        return errorBlock(`批量写入中存在重复路径：${request.rawPath}`)
      }
      resolvedPaths.add(resolved.path)
      entries.push({
        rawPath: request.rawPath,
        resolvedPath: resolved.path,
        content: request.content,
        append: request.append,
      })
    }

    return entries
  }

  async function notifyAdminsForPermissionRequest(request: {
    id: string
    access: string
    matcher: string
    pattern: string
    toolName: string
    conversationId?: string
    reason: string
  }) {
    if (!options.telegram || !(options.adminUsers || []).length) return
    const targets = findAdminPrivateChatTargets({
      workspaceRoot: runtimeRoot,
      conversationsDir: options.conversationsDir,
      adminUsers: options.adminUsers || [],
    })
    await Promise.all(
      targets.map(async (target) => {
        await options.telegram?.sendMessage(
          target.chatId,
          [
            "收到新的权限请求。",
            `requestId: ${request.id}`,
            `tool: ${request.toolName}`,
            `access: ${request.access}`,
            `rule: ${request.matcher}:${request.pattern}`,
            `reason: ${request.reason}`,
            `approve: /permit approve ${request.id}`,
            `reject: /permit reject ${request.id}`,
          ].join("\n"),
        )
      }),
    )
  }

  async function requestElevatedPathPermission(payload: {
    access: "read" | "write" | "run"
    targetPath: string
    rawTarget: string
    toolName: string
    reason: string
    conversationId?: string
  }) {
    const request = createElevatedPermissionRequest({
      workspaceRoot: runtimeRoot,
      access: payload.access,
      targetPath: payload.targetPath,
      rawTarget: payload.rawTarget,
      toolName: payload.toolName,
      reason: payload.reason,
      conversationId: payload.conversationId,
    })
    await notifyAdminsForPermissionRequest(request)
    return errorBlock(
      [
        `当前权限不足，已创建授权请求：${request.id}`,
        `请求类型：${request.access}`,
        `授权规则：${request.matcher}:${request.pattern}`,
        `原因：${request.reason}`,
        "请管理员执行：",
        `/permit approve ${request.id}`,
      ].join("\n"),
    )
  }

  const allDefinitions: Tool[] = [
    {
      name: "List",
      description: "列出目录下的文件（默认 /workspace，可传 path）。支持 /workspace、/attachments、/skills 虚拟路径。",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
      },
    },
    {
      name: "Read",
      description: "读取文件内容（默认 /workspace，支持 /attachments、/skills 路径）。",
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
      description: "写入一个或多个文件内容（默认 /workspace）。可用 path/content 写单文件，或用 files 数组批量写入。",
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
      description: "替换文件内容（默认当前会话 /workspace，oldText -> newText）。",
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
      description: "按 glob 模式匹配文件路径（默认相对当前会话 /workspace）。",
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
      description: "在 /workspace 下执行命令（带 guardrail，可引用 /workspace）。",
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
      name: "Task",
      description: "管理当前会话的任务计划（用于复杂任务的规划、执行与收尾）。",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["init", "update", "get", "list", "complete_all"],
          },
          payload: {
            type: "object",
            additionalProperties: true,
          },
          goal: { type: "string" },
          assumptions: {
            type: "array",
            items: { type: "string" },
          },
          summary: { type: "string" },
          outcome: { type: "string" },
          tasks: {
            type: "array",
            items: {
              type: "object",
              required: ["title"],
              properties: {
                title: { type: "string" },
                priority: {
                  type: "string",
                  enum: ["low", "medium", "high"],
                },
                blockedBy: {
                  type: "array",
                  items: { type: "string" },
                },
                blocks: {
                  type: "array",
                  items: { type: "string" },
                },
                skills: {
                  type: "array",
                  items: { type: "string" },
                },
                summary: { type: "string" },
                notes: {
                  type: "array",
                  items: { type: "string" },
                },
                outcome: { type: "string" },
              },
            },
          },
          taskId: { type: "string" },
          status: {
            type: "string",
            enum: ["pending", "in_progress", "done", "blocked", "planning", "executing"],
          },
          currentTaskId: { type: "string" },
          statusList: {
            type: "array",
            items: {
              type: "string",
              enum: ["pending", "in_progress", "done", "blocked"],
            },
          },
          onlyUnblocked: { type: "boolean" },
          note: { type: "string" },
          patch: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
    },
    {
      name: "ListScheduledTasks",
      description: "列出当前会话的定时任务与状态。",
      inputSchema: {
        type: "object",
        properties: {
          includeDeleted: { type: "boolean" },
        },
      },
    },
    {
      name: "CreateScheduledTask",
      description: "创建当前会话的定时任务。dueAt 必须使用未来时间的 ISO 8601 格式。",
      inputSchema: {
        type: "object",
        required: ["title", "dueAt"],
        properties: {
          title: { type: "string" },
          dueAt: { type: "string" },
          instructions: { type: "string" },
          triggerMode: {
            type: "string",
            enum: ["llm", "direct"],
          },
          directReply: { type: "string" },
        },
      },
    },
    {
      name: "UpdateScheduledTask",
      description: "更新当前会话的定时任务，可执行 postpone/complete/delete/archive/reopen/edit/merge。",
      inputSchema: {
        type: "object",
        required: ["taskId", "action"],
        properties: {
          taskId: { type: "string" },
          action: {
            type: "string",
            enum: ["postpone", "complete", "delete", "archive", "reopen", "edit", "merge"],
          },
          mergeTaskIds: { type: "array", items: { type: "string" } },
          dueAt: { type: "string" },
          title: { type: "string" },
          instructions: { type: "string" },
          triggerMode: {
            type: "string",
            enum: ["llm", "direct"],
          },
          directReply: { type: "string" },
        },
      },
    },
  ]

  const allHandlers: Record<string, (args: Record<string, unknown>) => Promise<ToolExecutionResult> | ToolExecutionResult> = {
    List: async (args) => {
      const rawPath = typeof args.path === "string" ? args.path : "/"
      const conversationId =
        typeof args.__conversationId === "string" ? args.__conversationId : undefined
      const resolved = resolveVirtualPath({
        rawPath,
        workspaceRoot: options.workspaceRoot,
        skillSources: options.skillSources,
        memoryDir: options.memoryDir,
        conversationsDir: options.conversationsDir,
        attachmentsDir,
        conversationId,
        allowExternalPaths: true,
      })
      if (!resolved) return errorBlock("路径无效")
      if (resolved.kind === "skills-root") {
        const skills = listSkills(options.skillSources, {
          allowlist: options.skillAllowlist,
          denylist: options.skillDenylist,
        })
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
        const skills = listSkills(options.skillSources, {
          sourceId: resolved.sourceId,
          allowlist: options.skillAllowlist,
          denylist: options.skillDenylist,
        })
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
      const effectiveWorkspaceRoot = resolveToolWorkspaceRoot({
        workspaceRoot: options.workspaceRoot,
      })
      if (
        resolved.kind === "path" &&
        !isAttachmentsVirtualPath(rawPath) &&
        !isPathAllowedByGrant({
          workspaceRoot: runtimeRoot,
          access: "read",
          targetPath: resolved.path,
        }) &&
        !resolved.path.startsWith(`${effectiveWorkspaceRoot}/`) &&
        resolved.path !== effectiveWorkspaceRoot &&
        !resolved.path.startsWith(`${options.workspaceRoot}/`) &&
        resolved.path !== options.workspaceRoot
      ) {
        return requestElevatedPathPermission({
          access: "read",
          targetPath: resolved.path,
          rawTarget: rawPath,
          toolName: "List",
          reason: "需要列出当前工作区之外的目录",
          conversationId,
        })
      }
      if (!existsSync(resolved.path)) return errorBlock("路径不存在")
      const entries = readdirSync(resolved.path)
      return textBlock(
        withAgentsContext({
          workspaceRoot: options.workspaceRoot,
          targetPath: resolved.path,
          body: entries.join("\n"),
        }),
      )
    },
    Read: async (args) => {
      const rawPath = typeof args.path === "string" ? args.path : ""
      const conversationId =
        typeof args.__conversationId === "string" ? args.__conversationId : undefined
      if (!rawPath) return errorBlock("path 必填")
      const resolved = resolveVirtualPath({
        rawPath,
        workspaceRoot: options.workspaceRoot,
        skillSources: options.skillSources,
        memoryDir: options.memoryDir,
        conversationsDir: options.conversationsDir,
        attachmentsDir,
        conversationId,
        allowExternalPaths: true,
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
            {
              allowlist: options.skillAllowlist,
              denylist: options.skillDenylist,
            },
          )
          return textBlock(content)
        } catch (error) {
          return errorBlock((error as Error).message)
        }
      }
      const effectiveWorkspaceRoot = resolveToolWorkspaceRoot({
        workspaceRoot: options.workspaceRoot,
      })
      if (
        resolved.kind === "path" &&
        !isAttachmentsVirtualPath(rawPath) &&
        !isPathAllowedByGrant({
          workspaceRoot: runtimeRoot,
          access: "read",
          targetPath: resolved.path,
        }) &&
        !resolved.path.startsWith(`${effectiveWorkspaceRoot}/`) &&
        resolved.path !== effectiveWorkspaceRoot &&
        !resolved.path.startsWith(`${options.workspaceRoot}/`) &&
        resolved.path !== options.workspaceRoot
      ) {
        return requestElevatedPathPermission({
          access: "read",
          targetPath: resolved.path,
          rawTarget: rawPath,
          toolName: "Read",
          reason: "需要读取当前工作区之外的文件",
          conversationId,
        })
      }
      if (!existsSync(resolved.path)) return errorBlock("路径不存在")
      const content = readFileSync(resolved.path, "utf-8")
      return textBlock(
        withAgentsContext({
          workspaceRoot: options.workspaceRoot,
          targetPath: dirname(resolved.path),
          bodyPath: resolved.path,
          body: content,
        }),
      )
    },
    Write: async (args) => {
      const resolvedEntries = resolveWriteEntries(args)
      if (!Array.isArray(resolvedEntries)) {
        return resolvedEntries
      }
      resolvedEntries.forEach((entry) => {
        mkdirSync(dirname(entry.resolvedPath), { recursive: true })
        const existing = existsSync(entry.resolvedPath)
          ? readFileSync(entry.resolvedPath, "utf-8")
          : ""
        const next = entry.append ? existing + entry.content : entry.content
        writeFileSync(entry.resolvedPath, next)
      })
      if (resolvedEntries.length === 1) {
        return textBlock("写入完成")
      }
      return textBlock(
        [
          `批量写入完成（${resolvedEntries.length} 个文件）`,
          ...resolvedEntries.map((entry) => `- ${entry.rawPath}`),
        ].join("\n"),
      )
    },
    Edit: async (args) => {
      const rawPath = typeof args.path === "string" ? args.path : ""
      const oldText = typeof args.oldText === "string" ? args.oldText : ""
      const newText = typeof args.newText === "string" ? args.newText : ""
      const replaceAll = Boolean(args.replaceAll)
      const conversationId =
        typeof args.__conversationId === "string" ? args.__conversationId : undefined
      if (!rawPath) return errorBlock("path 必填")
      if (isAttachmentsVirtualPath(rawPath)) {
        return errorBlock("附件目录是只读的，不允许修改")
      }
      const resolved = resolveVirtualPath({
        rawPath,
        workspaceRoot: options.workspaceRoot,
        skillSources: options.skillSources,
        memoryDir: options.memoryDir,
        conversationsDir: options.conversationsDir,
        attachmentsDir,
        conversationId,
        allowExternalPaths: true,
      })
      if (!resolved || resolved.kind !== "path") {
        return errorBlock("路径无效或不允许修改")
      }
      const effectiveWorkspaceRoot = resolveToolWorkspaceRoot({
        workspaceRoot: options.workspaceRoot,
      })
      if (
        !isPathAllowedByGrant({
          workspaceRoot: runtimeRoot,
          access: "write",
          targetPath: resolved.path,
        }) &&
        !resolved.path.startsWith(`${effectiveWorkspaceRoot}/`) &&
        resolved.path !== effectiveWorkspaceRoot &&
        !resolved.path.startsWith(`${options.workspaceRoot}/`) &&
        resolved.path !== options.workspaceRoot
      ) {
        return requestElevatedPathPermission({
          access: "write",
          targetPath: resolved.path,
          rawTarget: rawPath,
          toolName: "Edit",
          reason: "需要修改当前工作区之外的文件",
          conversationId,
        })
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
      const conversationId =
        typeof args.__conversationId === "string" ? args.__conversationId : undefined
      if (!pattern) return errorBlock("pattern 必填")
      const maxEntries = typeof args.maxEntries === "number" ? Math.max(1, Math.min(5000, args.maxEntries)) : 2000
      const regex = globToRegex(pattern.replace(/\\/g, "/"))
      const effectiveWorkspaceRoot = resolveToolWorkspaceRoot({
        workspaceRoot: options.workspaceRoot,
      })
      const files = walkDir(effectiveWorkspaceRoot, maxEntries)
      const matched = files
        .map((file) => relative(effectiveWorkspaceRoot, file).replace(/\\/g, "/"))
        .filter((file) => regex.test(file))
      return textBlock(matched.join("\n"))
    },
    Run: async (args) => {
      const command = typeof args.command === "string" ? args.command : ""
      const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 60000
      const conversationId =
        typeof args.__conversationId === "string" ? args.__conversationId : undefined
      if (!command) return errorBlock("command 必填")
      const effectiveWorkspaceRoot = resolveToolWorkspaceRoot({
        workspaceRoot: options.workspaceRoot,
      })
      const resolvedCommand = resolveCommandVirtualPaths(command, {
        "/workspace": effectiveWorkspaceRoot,
      })
      const guard = validateCommand(resolvedCommand, effectiveWorkspaceRoot)
      if (!guard.ok) {
        const deniedPaths = Array.isArray(guard.deniedPaths) ? guard.deniedPaths : []
        const guardReason = typeof guard.reason === "string" ? guard.reason : "guardrail denied"
        const granted =
          deniedPaths.length > 0 &&
          deniedPaths.every((path) =>
            isPathAllowedByGrant({
              workspaceRoot: runtimeRoot,
              access: "run",
              targetPath: path,
            }),
          )
        if (granted) {
          // fall through and execute with the approved external-path rule
        } else if (
          deniedPaths.length &&
          !guardReason.startsWith("Command blocked:")
        ) {
          return requestElevatedPathPermission({
            access: "run",
            targetPath: deniedPaths[0] || effectiveWorkspaceRoot,
            rawTarget: deniedPaths[0] || command,
            toolName: "Run",
            reason: `需要在当前工作区之外执行命令相关路径访问：${command}`,
            conversationId,
          })
        } else {
          return errorBlock(`命令被拒绝: ${guardReason}`)
        }
      }
      return new Promise((resolvePromise) => {
        exec(
          resolvedCommand,
          { cwd: effectiveWorkspaceRoot, timeout: timeoutMs, maxBuffer: 1024 * 1024 },
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
    Task: async (args) => {
      const conversationId =
        typeof args.__conversationId === "string" ? args.__conversationId.trim() : ""
      if (!conversationId) {
        return errorBlock("当前没有会话上下文，无法管理任务计划")
      }

      const conversationDir = ensureConversationDir(
        options.conversationsDir,
        conversationId,
      )
      const payload = isRecord(args.payload) ? args.payload : args
      const rawAction =
        typeof payload.action === "string"
          ? payload.action
          : typeof args.action === "string"
            ? args.action
            : ""
      const isEmptyPayload =
        Object.keys(payload).filter((key) => key !== "__conversationId").length === 0
      const action = parseTaskAction(rawAction) || (isEmptyPayload ? "list" : "")

      if (!action) {
        return errorBlock("Task.action 无效，允许值：init/update/get/list/complete_all")
      }

      if (action === "init") {
        const plan = initTaskPlan({
          conversationDir,
          goal:
            typeof payload.goal === "string"
              ? payload.goal.trim()
              : typeof payload.originalUserRequest === "string"
                ? payload.originalUserRequest.trim()
                : "",
          tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
          assumptions: Array.isArray(payload.assumptions) ? payload.assumptions : [],
          summary: typeof payload.summary === "string" ? payload.summary.trim() : "",
          status: parseTaskPlanStatus(payload.status),
        })
        return textBlock(withStructuredData("任务计划已初始化。", plan))
      }

      if (action === "update") {
        const taskId =
          typeof payload.taskId === "string" ? payload.taskId.trim() : ""
        if (taskId) {
          const patch = buildTaskItemPatch(
            isRecord(payload.patch) ? payload.patch : {},
          )
          const nextStatus = parseTaskStatus(payload.status)
          if (nextStatus) {
            patch.status = nextStatus
          }
          if (typeof payload.summary === "string") {
            patch.summary = payload.summary.trim()
          }
          if (typeof payload.outcome === "string") {
            patch.outcome = payload.outcome.trim()
          }
          if (typeof payload.note === "string") {
            patch.appendNote = payload.note.trim()
          }
          const hasPatchKeys = Object.keys(patch).length > 0
          const plan = hasPatchKeys
            ? updateTaskItem({
                conversationDir,
                taskId,
                patch,
              })
            : updateTaskStatus({
                conversationDir,
                taskId,
                status: nextStatus,
              })
          if (!plan) {
            return errorBlock(`未找到任务：${taskId}`)
          }
          return textBlock(withStructuredData("任务状态已更新。", plan))
        }

        const plan = updateTaskPlanStatus({
          conversationDir,
          status: parseTaskPlanStatus(payload.status),
          currentTaskId:
            typeof payload.currentTaskId === "string"
              ? payload.currentTaskId.trim()
              : undefined,
          goal: typeof payload.goal === "string" ? payload.goal.trim() : undefined,
          assumptions: Array.isArray(payload.assumptions)
            ? payload.assumptions
            : undefined,
          summary:
            typeof payload.summary === "string"
              ? payload.summary.trim()
              : undefined,
          outcome:
            typeof payload.outcome === "string"
              ? payload.outcome.trim()
              : undefined,
        })
        if (!plan) {
          return errorBlock("未找到任务计划")
        }
        return textBlock(withStructuredData("计划状态已更新。", plan))
      }

      if (action === "get") {
        const plan = getTaskPlan(conversationDir)
        const hint = isEmptyPayload
          ? '提示: 调用 Task 时请提供 action 字段，例如 {"action":"get"}。'
          : ""
        const text = [hint, plan ? "已获取任务计划。" : "未找到任务计划。"]
          .filter(Boolean)
          .join("\n")
        return plan
          ? textBlock(withStructuredData(text, plan))
          : errorBlock(text)
      }

      if (action === "list") {
        const onlyUnblocked = payload.onlyUnblocked !== false
        const statusListSource = Array.isArray(payload.statusList)
          ? payload.statusList
          : Array.isArray(payload.status)
            ? payload.status
            : []
        const statusList = statusListSource
          .map(parseTaskStatus)
          .filter((value): value is TaskStatus => Boolean(value))
        const tasks = onlyUnblocked
          ? listUnblockedTasks({
              conversationDir,
              status: statusList.length ? statusList : undefined,
            })
          : getTaskPlan(conversationDir)?.tasks || []
        const hint = isEmptyPayload
          ? '提示: 调用 Task 时请提供 action 字段，例如 {"action":"list"}。'
          : ""
        return textBlock(
          withStructuredData(
            [hint, tasks.length ? `已获取 ${tasks.length} 个任务。` : "未找到任务。"]
              .filter(Boolean)
              .join("\n"),
            tasks,
          ),
        )
      }

      const plan = completeAllTasks({
        conversationDir,
        summary: typeof payload.summary === "string" ? payload.summary.trim() : "",
        outcome: typeof payload.outcome === "string" ? payload.outcome.trim() : "",
      })
      if (!plan) {
        return errorBlock("未找到任务计划")
      }
      return textBlock(withStructuredData("任务计划已完成。", plan))
    },
    ListScheduledTasks: async (args) => {
      const conversationId =
        typeof args.__conversationId === "string" ? args.__conversationId.trim() : ""
      if (!conversationId) {
        return errorBlock("当前没有会话上下文，无法读取定时任务")
      }
      const conversationDir = ensureConversationDir(
        options.conversationsDir,
        conversationId,
      )
      const tasks = listConversationTasks({
        conversationDir,
        conversationId,
        includeDeleted: Boolean(args.includeDeleted),
      })
      return textBlock(formatTasksForTool(tasks))
    },
    CreateScheduledTask: async (args) => {
      const conversationId =
        typeof args.__conversationId === "string" ? args.__conversationId.trim() : ""
      if (!conversationId) {
        return errorBlock("当前没有会话上下文，无法创建定时任务")
      }
      try {
        const conversationDir = ensureConversationDir(
          options.conversationsDir,
          conversationId,
        )
        const task = createScheduledTask({
          conversationDir,
          conversationId,
          title: typeof args.title === "string" ? args.title : "",
          dueAt: typeof args.dueAt === "string" ? args.dueAt : "",
          instructions: typeof args.instructions === "string" ? args.instructions : "",
          triggerMode: args.triggerMode === "direct" ? "direct" : "llm",
          directReply: typeof args.directReply === "string" ? args.directReply : "",
        })
        return textBlock(
          JSON.stringify(
            {
              ok: true,
              task,
              todoPath: "内部运行时 TODO 视图",
            },
            null,
            2,
          ),
        )
      } catch (error) {
        return errorBlock((error as Error).message)
      }
    },
    UpdateScheduledTask: async (args) => {
      const conversationId =
        typeof args.__conversationId === "string" ? args.__conversationId.trim() : ""
      if (!conversationId) {
        return errorBlock("当前没有会话上下文，无法更新定时任务")
      }
      try {
        const conversationDir = ensureConversationDir(
          options.conversationsDir,
          conversationId,
        )
        const action =
          typeof args.action === "string" ? args.action.trim().toLowerCase() : ""
        if (
          action !== "postpone" &&
          action !== "complete" &&
          action !== "delete" &&
          action !== "archive" &&
          action !== "reopen" &&
          action !== "edit" &&
          action !== "merge"
        ) {
          return errorBlock("action 无效")
        }
        const task = updateScheduledTask({
          conversationDir,
          conversationId,
          taskId: typeof args.taskId === "string" ? args.taskId : "",
          action,
          dueAt: typeof args.dueAt === "string" ? args.dueAt : undefined,
          title: typeof args.title === "string" ? args.title : undefined,
          instructions:
            typeof args.instructions === "string" ? args.instructions : undefined,
          triggerMode:
            args.triggerMode === "direct"
              ? "direct"
              : args.triggerMode === "llm"
                ? "llm"
                : undefined,
          directReply:
            typeof args.directReply === "string" ? args.directReply : undefined,
          mergeTaskIds: Array.isArray(args.mergeTaskIds)
            ? args.mergeTaskIds.map((value) => String(value))
            : undefined,
        })
        return textBlock(
          JSON.stringify(
            {
              ok: true,
              task,
              todoPath: "内部运行时 TODO 视图",
            },
            null,
            2,
          ),
        )
      } catch (error) {
        return errorBlock((error as Error).message)
      }
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
