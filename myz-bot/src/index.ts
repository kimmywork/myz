import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import type { Message, TokenUsage } from "@myz/ai-core/types"
import { registerLocalTools } from "@myz/ai-core/tools/registry"
import type {
  ChatChannelClient,
  ChatMessage,
} from "./chatChannel"
import { createBotAssistantAgent } from "./agents/botAssistant"
import { generateReply } from "./ai"
import { loadConfig, type BotRuntimeConfig } from "./config"
import {
  appendMessage,
  createAssistantMessage,
  createSystemMessage,
  createUserMessage,
  ensureSessionDir,
  loadAllMessages,
  loadSessionMetadata,
  saveSessionMetadata,
  createSession,
  forkSession,
  archiveSession,
  getActiveSession,
  listSessions,
  type SessionMetadata,
} from "./sessions"
import { appendHistoryEntry } from "./history"
import { prepareSessionContext } from "./contextCompaction"
import {
  formatSupportedBotCommands,
  isPassthroughBotCommandName,
  isSupportedBotCommandName,
  parseBotCommand,
} from "./commands"
import {
  appendSessionErrorLog,
  formatErrorReply,
} from "./errors"
import {
  approveElevatedPermissionRequest,
  createElevatedPermissionGrant,
  listElevatedPermissionGrants,
  listElevatedPermissionRequests,
  rejectElevatedPermissionRequest,
  revokeElevatedPermissionGrant,
  type ElevatedPermissionAccess,
  type ElevatedPermissionGrant,
  type ElevatedPermissionRequest,
} from "./elevatedPermissions"
import { buildIncomingMessage } from "./incoming"
import {
  collectTokenUsageSummary,
  formatBotRuntimeStatus,
  formatTokenUsageSummary,
  getBotRuntimeStatus,
  requestProcessRestart,
} from "./maintenance"
import {
  extractCommandText,
  isAdminUser,
} from "./permissions"
import { configureGlobalNetwork } from "./network"
import { generateSoulDraftContent } from "./soulDraftGenerator"
import {
  applySoulDraft,
  createSoulDraft,
  listSoulDrafts,
  readSoulDraft,
} from "./soul"
import { buildReplyOptions } from "./replyOptions"
import { createToolProgressNotifier } from "./toolProgress"
import {
  listSkills,
  readSkillFile,
  type SkillInfo,
} from "./skills"
import { resolveSessionRoute } from "./routing"
import { startTaskScheduler } from "./scheduler"
import {
  ensureSessionTaskFiles,
  formatTasksForChat,
  listSessionTasks,
  updateScheduledTask,
} from "./tasks"
import {
  appendToolAuditTrace,
  appendToolMessagesToSessionHistory,
} from "./toolHistory"
import { createLocalTools } from "./tools"
import {
  applyUpgrade,
  checkForUpgrade,
  formatUpgradeStatus,
  syncUpgradeState,
} from "./upgrade"
import { createRuntimeMonitor, type RuntimeMonitor } from "./runtimeMonitor"
import {
  createTuiAwareChannelClient,
  startLocalTuiChannel,
} from "./tuiChannel"

function resolveTuiEnabled(value?: boolean) {
  if (typeof value === "boolean") return value
  const envValue = (process.env.MYZ_BOT_TUI || "").trim().toLowerCase()
  if (!envValue) return true
  if (["0", "false", "off", "no"].includes(envValue)) return false
  if (["1", "true", "on", "yes"].includes(envValue)) return true
  return true
}

function formatSkillList(skills: SkillInfo[]) {
  if (!skills.length) {
    return "当前没有可用技能。"
  }
  return skills
    .map((skill) => `- ${skill.sourceId}/${skill.name}: ${skill.description || ""}`.trim())
    .join("\n")
}

function isNoReplyContent(content: string) {
  const normalized = content.trim()
  return normalized === "" || normalized === "NO_REPLY"
}

function buildSkillPathArgument(args: string[]) {
  const [first = "", ...rest] = args
  if (!first) return ""
  if (rest.length) return [first, ...rest].join("/")
  return first
}

function loadVisibleSkills(config: BotRuntimeConfig, sourceId?: string) {
  return listSkills(config.skillSources, {
    sourceId,
    allowlist: config.skillAllowlist,
    denylist: config.skillDenylist,
  })
}

function isElevatedPermissionAccess(value: string): value is ElevatedPermissionAccess {
  return value === "read" || value === "write" || value === "run"
}

function formatPermissionRule(
  entry: Pick<ElevatedPermissionGrant, "matcher" | "pattern"> | Pick<ElevatedPermissionRequest, "matcher" | "pattern">,
) {
  return `${entry.matcher}:${entry.pattern}`
}

async function handleCommand(options: {
  config: BotRuntimeConfig
  sessionId: string
  message: ChatMessage
  rawCommand: string
  botUsername: string
  monitor?: RuntimeMonitor
  sendMessage: (
    chatId: number,
    text: string,
    options?: { replyToMessageId?: number; messageThreadId?: number },
  ) => Promise<unknown>
}) {
  const command = parseBotCommand(options.rawCommand, options.botUsername)
  if (!command) return false
  if (isPassthroughBotCommandName(command.name)) return false
  if (!isSupportedBotCommandName(command.name)) {
    await options.sendMessage(
      options.message.chat.id,
      `未知命令：/${command.name}。可用命令：${formatSupportedBotCommands()}`,
      buildReplyOptions(options.message),
    )
    return true
  }

  if (command.name === "skills") {
    const argPath = buildSkillPathArgument(command.args)
    let replyText = ""
    if (!argPath) {
      replyText = formatSkillList(loadVisibleSkills(options.config))
    } else {
      const [sourceId, skillName, ...fileParts] = argPath.split("/").filter(Boolean)
      const sourceOnly = command.args.length === 1 && !skillName
      if (sourceOnly) {
        replyText = formatSkillList(loadVisibleSkills(options.config, sourceId))
      } else if (sourceId && skillName) {
        replyText = readSkillFile(
          options.config.skillSources,
          skillName,
          fileParts.length ? fileParts.join("/") : "SKILL.md",
          sourceId,
          {
            allowlist: options.config.skillAllowlist,
            denylist: options.config.skillDenylist,
          },
        )
      } else {
        replyText = "用法：/skills 或 /skills/<source>/<name>"
      }
    }
    await options.sendMessage(
      options.message.chat.id,
      replyText,
      buildReplyOptions(options.message),
    )
    return true
  }

  if (command.name === "todo") {
    const sessionDir = ensureSessionDir(
      options.config.sessionsDir,
      options.sessionId,
    )
    ensureSessionTaskFiles(sessionDir, options.sessionId)
    const action = (command.args[0] || "list").toLowerCase()

    if (action === "list" || action === "show") {
      const tasks = listSessionTasks({
        sessionDir,
        sessionId: options.sessionId,
      })
      await options.sendMessage(
        options.message.chat.id,
        `${formatTasksForChat(tasks)}\n\n需要继续操作时可直接使用 /todo 命令。`,
        buildReplyOptions(options.message),
      )
      return true
    }

    if (
      action === "complete" ||
      action === "archive" ||
      action === "delete" ||
      action === "reopen"
    ) {
      const taskId = command.args[1]
      if (!taskId) {
        await options.sendMessage(
          options.message.chat.id,
          "用法：/todo <complete|archive|delete|reopen> <taskId>",
          buildReplyOptions(options.message),
        )
        return true
      }
      const task = updateScheduledTask({
        sessionDir,
        sessionId: options.sessionId,
        taskId,
        action,
      })
      await options.sendMessage(
        options.message.chat.id,
        `任务已更新：${task.id} -> ${task.status}`,
        buildReplyOptions(options.message),
      )
      return true
    }

    if (action === "merge") {
      const taskId = command.args[1]
      const mergeTaskIds = command.args.slice(2).filter(Boolean)
      if (!taskId || !mergeTaskIds.length) {
        await options.sendMessage(
          options.message.chat.id,
          "用法：/todo merge <keepTaskId> <taskId...>",
          buildReplyOptions(options.message),
        )
        return true
      }
      const task = updateScheduledTask({
        sessionDir,
        sessionId: options.sessionId,
        taskId,
        action: "merge",
        mergeTaskIds,
      })
      await options.sendMessage(
        options.message.chat.id,
        `任务已合并：保留 ${task.id}，合并 ${mergeTaskIds.length} 个重复项`,
        buildReplyOptions(options.message),
      )
      return true
    }

    if (action === "postpone") {
      const taskId = command.args[1]
      const dueAt = command.args[2]
      if (!taskId || !dueAt) {
        await options.sendMessage(
          options.message.chat.id,
          "用法：/todo postpone <taskId> <dueAt-ISO8601>",
          buildReplyOptions(options.message),
        )
        return true
      }
      const task = updateScheduledTask({
        sessionDir,
        sessionId: options.sessionId,
        taskId,
        action: "postpone",
        dueAt,
      })
      await options.sendMessage(
        options.message.chat.id,
        `任务已延期：${task.id} -> ${task.dueAt}`,
        buildReplyOptions(options.message),
      )
      return true
    }

    if (action === "edit") {
      const taskId = command.args[1]
      const dueAtArg = command.args[2]
      const title = command.args.slice(3).join(" ").trim()
      if (!taskId) {
        await options.sendMessage(
          options.message.chat.id,
          "用法：/todo edit <taskId> [dueAt-ISO8601|-] [title]",
          buildReplyOptions(options.message),
        )
        return true
      }
      const task = updateScheduledTask({
        sessionDir,
        sessionId: options.sessionId,
        taskId,
        action: "edit",
        dueAt:
          typeof dueAtArg === "string" && dueAtArg.trim() && dueAtArg !== "-"
            ? dueAtArg
            : undefined,
        title: title || undefined,
      })
      await options.sendMessage(
        options.message.chat.id,
        `任务已编辑：${task.id} -> ${task.dueAt} ${task.title}`,
        buildReplyOptions(options.message),
      )
      return true
    }

    await options.sendMessage(
      options.message.chat.id,
      "可用命令：/todo list | /todo edit <taskId> [dueAt-ISO8601|-] [title] | /todo merge <keepTaskId> <taskId...> | /todo postpone <taskId> <dueAt-ISO8601> | /todo complete <taskId> | /todo archive <taskId> | /todo delete <taskId> | /todo reopen <taskId>",
      buildReplyOptions(options.message),
    )
    return true
  }

  if (command.name === "ops") {
    if (!isAdminUser(options.config, options.message.from)) {
      await options.sendMessage(
        options.message.chat.id,
        "只有管理员可以执行运维命令。",
        buildReplyOptions(options.message),
      )
      return true
    }

    const action = (command.args[0] || "status").toLowerCase()
    const scope = (command.args[1] || "current").toLowerCase()
    const normalizedScope = scope === "all" ? "all" : "current"
    if (action === "status") {
      await options.sendMessage(
        options.message.chat.id,
        formatBotRuntimeStatus(getBotRuntimeStatus(options.config)),
        buildReplyOptions(options.message),
      )
      return true
    }

    if (action === "usage") {
      await options.sendMessage(
        options.message.chat.id,
        formatTokenUsageSummary(
          collectTokenUsageSummary({
            config: options.config,
            scope: normalizedScope,
            sessionId: options.sessionId,
          }),
        ),
        buildReplyOptions(options.message),
      )
      return true
    }

    if (action === "upgrade") {
      const subaction = (command.args[1] || "status").toLowerCase()

      if (subaction === "status") {
        const state = syncUpgradeState(options.config)
        await options.sendMessage(
          options.message.chat.id,
          formatUpgradeStatus(state),
          buildReplyOptions(options.message),
        )
        return true
      }

      if (subaction === "check") {
        try {
          const result = await checkForUpgrade({
            config: options.config,
          })
          await options.sendMessage(
            options.message.chat.id,
            formatUpgradeStatus(result.state),
            buildReplyOptions(options.message),
          )
        } catch (error) {
          const state = syncUpgradeState(options.config)
          await options.sendMessage(
            options.message.chat.id,
            `${formatUpgradeStatus(state)}\n\n升级检查失败：${(error as Error).message}`,
            buildReplyOptions(options.message),
          )
        }
        return true
      }

      if (subaction === "apply") {
        try {
          const result = await applyUpgrade({
            config: options.config,
            requestedBy:
              options.message.from?.username || options.message.from?.id?.toString() || "unknown",
            scheduleExit: true,
          })
          await options.sendMessage(
            options.message.chat.id,
            `${result.message}\n\n${formatUpgradeStatus(result.state)}`,
            buildReplyOptions(options.message),
          )
        } catch (error) {
          const state = syncUpgradeState(options.config)
          await options.sendMessage(
            options.message.chat.id,
            `${formatUpgradeStatus(state)}\n\n升级申请失败：${(error as Error).message}`,
            buildReplyOptions(options.message),
          )
        }
        return true
      }

      await options.sendMessage(
        options.message.chat.id,
        "用法：/ops upgrade [status|check|apply]",
        buildReplyOptions(options.message),
      )
      return true
    }

    if (action === "restart") {
      await options.sendMessage(
        options.message.chat.id,
        "已请求重启当前进程；若当前由 launch 托管，将自动拉起新进程。",
        buildReplyOptions(options.message),
      )
      requestProcessRestart({
        requestFilePath: resolve(options.config.systemDir, "restart-request.json"),
        reason: "ops_restart",
        requestedBy: options.message.from?.username || options.message.from?.id?.toString() || "unknown",
      })
      return true
    }

    await options.sendMessage(
      options.message.chat.id,
      "可用命令：/ops status | /ops usage [current|all] | /ops upgrade [status|check|apply] | /ops restart",
      buildReplyOptions(options.message),
    )
    return true
  }

  if (command.name === "permit") {
    if (!isAdminUser(options.config, options.message.from)) {
      await options.sendMessage(
        options.message.chat.id,
        "只有管理员可以处理权限请求。",
        buildReplyOptions(options.message),
      )
      return true
    }

    const action = (command.args[0] || "list").toLowerCase()
    if (action === "list") {
      const requests = listElevatedPermissionRequests(
        options.config.workspaceRuntimeRoot,
        "pending",
      )
      if (!requests.length) {
        await options.sendMessage(
          options.message.chat.id,
          "当前没有待处理的权限请求。",
          buildReplyOptions(options.message),
        )
        return true
      }
      await options.sendMessage(
        options.message.chat.id,
        [
          "待处理权限请求：",
          ...requests.slice(0, 12).map((request) =>
            `- ${request.id} | ${request.toolName} | ${request.access} | ${formatPermissionRule(request)}`,
          ),
        ].join("\n"),
        buildReplyOptions(options.message),
      )
      return true
    }

    if (action === "grants") {
      const grants = listElevatedPermissionGrants(options.config.workspaceRuntimeRoot)
      if (!grants.length) {
        await options.sendMessage(
          options.message.chat.id,
          "当前没有已授权规则。",
          buildReplyOptions(options.message),
        )
        return true
      }
      await options.sendMessage(
        options.message.chat.id,
        [
          "已授权规则：",
          ...grants.slice(0, 20).map((grant) =>
            `- ${grant.id} | ${grant.access} | ${formatPermissionRule(grant)} | by ${grant.approvedBy}`,
          ),
        ].join("\n"),
        buildReplyOptions(options.message),
      )
      return true
    }

    if (action === "grant") {
      const access = (command.args[1] || "").toLowerCase()
      const target = command.args.slice(2).join(" ").trim()
      if (!isElevatedPermissionAccess(access) || !target) {
        await options.sendMessage(
          options.message.chat.id,
          "用法：/permit grant <read|write|run> <path-or-glob>",
          buildReplyOptions(options.message),
        )
        return true
      }
      const actor = options.message.from?.username || String(options.message.from?.id || "admin")
      const grant = createElevatedPermissionGrant({
        workspaceRoot: options.config.workspaceRuntimeRoot,
        access,
        target,
        actor,
      })
      await options.sendMessage(
        options.message.chat.id,
        [
          `已添加授权规则：${grant.id}`,
          `access: ${grant.access}`,
          `rule: ${formatPermissionRule(grant)}`,
        ].join("\n"),
        buildReplyOptions(options.message),
      )
      return true
    }

    if (action === "approve") {
      const requestId = command.args[1]
      if (!requestId) {
        await options.sendMessage(
          options.message.chat.id,
          "用法：/permit approve <requestId>",
          buildReplyOptions(options.message),
        )
        return true
      }
      const actor = options.message.from?.username || String(options.message.from?.id || "admin")
      const { request, grant } = approveElevatedPermissionRequest({
        workspaceRoot: options.config.workspaceRuntimeRoot,
        requestId,
        actor,
      })
      await options.sendMessage(
        options.message.chat.id,
        [
          `已批准权限请求：${request.id}`,
          `grant: ${grant.id}`,
          `access: ${grant.access}`,
          `rule: ${formatPermissionRule(grant)}`,
        ].join("\n"),
        buildReplyOptions(options.message),
      )
      return true
    }

    if (action === "reject") {
      const requestId = command.args[1]
      if (!requestId) {
        await options.sendMessage(
          options.message.chat.id,
          "用法：/permit reject <requestId>",
          buildReplyOptions(options.message),
        )
        return true
      }
      const actor = options.message.from?.username || String(options.message.from?.id || "admin")
      const request = rejectElevatedPermissionRequest({
        workspaceRoot: options.config.workspaceRuntimeRoot,
        requestId,
        actor,
      })
      await options.sendMessage(
        options.message.chat.id,
        `已拒绝权限请求：${request.id}`,
        buildReplyOptions(options.message),
      )
      return true
    }

    if (action === "revoke") {
      const grantId = command.args[1]
      if (!grantId) {
        await options.sendMessage(
          options.message.chat.id,
          "用法：/permit revoke <grantId>",
          buildReplyOptions(options.message),
        )
        return true
      }
      const grant = revokeElevatedPermissionGrant({
        workspaceRoot: options.config.workspaceRuntimeRoot,
        grantId,
      })
      await options.sendMessage(
        options.message.chat.id,
        `已撤销授权规则：${grant.id} | ${grant.access} | ${formatPermissionRule(grant)}`,
        buildReplyOptions(options.message),
      )
      return true
    }

    await options.sendMessage(
      options.message.chat.id,
      "可用命令：/permit list | /permit grants | /permit grant <read|write|run> <path-or-glob> | /permit approve <requestId> | /permit reject <requestId> | /permit revoke <grantId>",
      buildReplyOptions(options.message),
    )
    return true
  }

  if (command.name === "session") {
    const action = (command.args[0] || "list").toLowerCase()

    if (action === "list") {
      const sessions = listSessions(options.config.sessionsDir, { limit: 10 })
      if (!sessions.length) {
        await options.sendMessage(
          options.message.chat.id,
          "当前没有会话。",
          buildReplyOptions(options.message),
        )
        return true
      }
      const text = [
        "最近会话：",
        ...sessions.map((s) => {
          const status = s.status === "active" ? "🟢" : "⚪"
          const title = s.title || s.sessionId
          return `${status} ${title} (${s.sessionId})`
        }),
      ].join("\n")
      await options.sendMessage(
        options.message.chat.id,
        text,
        buildReplyOptions(options.message),
      )
      return true
    }

    if (action === "info") {
      const sessionId = command.args[1] || options.sessionId
      const sessionDir = ensureSessionDir(options.config.sessionsDir, sessionId)
      const metadata = loadSessionMetadata(sessionDir)
      if (!metadata) {
        await options.sendMessage(
          options.message.chat.id,
          `会话不存在：${sessionId}`,
          buildReplyOptions(options.message),
        )
        return true
      }
      const text = [
        `会话 ID: ${metadata.sessionId}`,
        `标题: ${metadata.title || "无"}`,
        `状态: ${metadata.status}`,
        `创建时间: ${metadata.createdAt}`,
        `更新时间: ${metadata.updatedAt}`,
        `消息数: ${metadata.messageCount}`,
        metadata.parentSessionId ? `父会话: ${metadata.parentSessionId}` : null,
      ]
        .filter(Boolean)
        .join("\n")
      await options.sendMessage(
        options.message.chat.id,
        text,
        buildReplyOptions(options.message),
      )
      return true
    }

    await options.sendMessage(
      options.message.chat.id,
      "可用命令：/session list | /session info [sessionId]",
      buildReplyOptions(options.message),
    )
    return true
  }

  if (command.name === "clear") {
    const newSession = createSession(options.config.sessionsDir, options.config.workspaceId, {
      title: command.args.join(" ").trim() || undefined,
    })
    await options.sendMessage(
      options.message.chat.id,
      `新会话已创建：${newSession.sessionId}`,
      buildReplyOptions(options.message),
    )
    return true
  }

  if (command.name === "resume") {
    const sessionId = command.args[0]
    if (!sessionId) {
      const sessions = listSessions(options.config.sessionsDir, { status: "active", limit: 5 })
      if (!sessions.length) {
        await options.sendMessage(
          options.message.chat.id,
          "没有可恢复的会话。",
          buildReplyOptions(options.message),
        )
        return true
      }
      const text = [
        "可用会话：",
        ...sessions.map((s) => `- ${s.sessionId}: ${s.title || "无标题"}`),
        "",
        "用法：/resume <sessionId>",
      ].join("\n")
      await options.sendMessage(
        options.message.chat.id,
        text,
        buildReplyOptions(options.message),
      )
      return true
    }

    const sessionDir = ensureSessionDir(options.config.sessionsDir, sessionId)
    const metadata = loadSessionMetadata(sessionDir)
    if (!metadata) {
      await options.sendMessage(
        options.message.chat.id,
        `会话不存在：${sessionId}`,
        buildReplyOptions(options.message),
      )
      return true
    }

    await options.sendMessage(
      options.message.chat.id,
      `已切换到会话：${sessionId}`,
      buildReplyOptions(options.message),
    )
    return true
  }

  if (command.name === "fork") {
    const sourceSessionId = command.args[0] || options.sessionId
    const sourceDir = ensureSessionDir(options.config.sessionsDir, sourceSessionId)
    const sourceMessages = loadAllMessages(sourceDir)

    if (!sourceMessages.length) {
      await options.sendMessage(
        options.message.chat.id,
        `会话 ${sourceSessionId} 没有消息，无法分叉。`,
        buildReplyOptions(options.message),
      )
      return true
    }

    const lastMessage = sourceMessages[sourceMessages.length - 1]
    const newSession = forkSession(
      options.config.sessionsDir,
      sourceSessionId,
      lastMessage.id,
      options.config.workspaceId,
    )

    if (!newSession) {
      await options.sendMessage(
        options.message.chat.id,
        `分叉失败：无法从 ${sourceSessionId} 创建新会话。`,
        buildReplyOptions(options.message),
      )
      return true
    }

    await options.sendMessage(
      options.message.chat.id,
      `已从 ${sourceSessionId} 分叉出新会话：${newSession.sessionId}`,
      buildReplyOptions(options.message),
    )
    return true
  }

  if (!isAdminUser(options.config, options.message.from)) {
    await options.sendMessage(
      options.message.chat.id,
      "只有管理员可以执行 SOUL 管理命令。",
      buildReplyOptions(options.message),
    )
    return true
  }

  const action = (command.args[0] || "").toLowerCase()
  if (!action || action === "list") {
    const drafts = listSoulDrafts(options.config.workspaceRuntimeRoot)
    const text = drafts.length
      ? ["当前 SOUL 草案：", ...drafts.map((draft) => `- ${draft.id}`)].join("\n")
      : "当前没有 SOUL 草案。"
    await options.sendMessage(
      options.message.chat.id,
      text,
      buildReplyOptions(options.message),
    )
    return true
  }

  if (action === "draft") {
    const existingMessages = loadAllMessages(
      ensureSessionDir(options.config.sessionsDir, options.sessionId),
    )
    const actor = options.message.from?.username || String(options.message.from?.id || "admin")
    const content = await generateSoulDraftContent({
      config: options.config,
      sessionId: options.sessionId,
      recentMessages: existingMessages,
      actor,
    })
    const draft = createSoulDraft({
      runtimeRoot: options.config.workspaceRuntimeRoot,
      content,
      metadata: {
        actor,
        trigger: "manual",
        sessionId: options.sessionId,
      },
    })
    await options.sendMessage(
      options.message.chat.id,
      `SOUL 草案已生成：${draft.id}`,
      buildReplyOptions(options.message),
    )
    return true
  }

  if (action === "apply") {
    const draftId = command.args[1]
    if (!draftId) {
      await options.sendMessage(
        options.message.chat.id,
        "用法：/soul apply <draftId>",
        buildReplyOptions(options.message),
      )
      return true
    }
    if (options.config.soul.reviewRequired !== false && !isAdminUser(options.config, options.message.from)) {
      await options.sendMessage(
        options.message.chat.id,
        "当前配置要求管理员确认后才能应用 SOUL 草案。",
        buildReplyOptions(options.message),
      )
      return true
    }
    applySoulDraft({
      workspaceRoot: options.config.workspaceRoot,
      runtimeRoot: options.config.workspaceRuntimeRoot,
      draftId,
      metadata: {
        actor: options.message.from?.username || String(options.message.from?.id || "admin"),
      },
    })
    const preview = readSoulDraft(options.config.workspaceRuntimeRoot, draftId)
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, 4)
      .join("\n")
    await options.sendMessage(
      options.message.chat.id,
      `SOUL 已应用：${draftId}\n${preview}`,
      buildReplyOptions(options.message),
    )
    return true
  }

  await options.sendMessage(
    options.message.chat.id,
    "可用命令：/soul list | /soul draft | /soul apply <draftId>",
    buildReplyOptions(options.message),
  )
  return true
}

async function handleSessionMessage(options: {
  config: BotRuntimeConfig
  channel: ChatChannelClient<ChatMessage>
  message: ChatMessage
  botUsername: string
  shouldReply: boolean
  monitor?: RuntimeMonitor
  sessionId?: string
}) {
  const route = resolveSessionRoute(options.message)
  const userId = route.actorUserId

  let sessionId = options.sessionId
  if (!sessionId) {
    const active = getActiveSession(options.config.sessionsDir, options.config.workspaceId)
    sessionId = active?.sessionId || createSession(options.config.sessionsDir, options.config.workspaceId).sessionId
  }

  const sessionDir = ensureSessionDir(options.config.sessionsDir, sessionId)
  ensureSessionTaskFiles(sessionDir, sessionId)
  const sessionWorkspace = options.config.workspaceRoot

  const now = new Date().toISOString()
  const existing = loadSessionMetadata(sessionDir)
  const metadata: SessionMetadata = existing || {
    schemaVersion: "1.0.0",
    sessionId,
    workspaceId: options.config.workspaceId,
    title: `Session ${sessionId}`,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    messageCount: 0,
    status: "active",
  }
  metadata.updatedAt = now
  metadata.lastMessageAt = now
  saveSessionMetadata(sessionDir, metadata)

  const rawCommand = extractCommandText(options.message)
  if (rawCommand) {
    try {
      const handled = await handleCommand({
        config: options.config,
        sessionId,
        message: options.message,
        rawCommand,
        botUsername: options.botUsername,
        monitor: options.monitor,
        sendMessage: (chatId, text, sendOptions) => {
          options.monitor?.notePhase("send", sessionId)
          options.monitor?.noteOutgoingMessage({
            sessionId,
            text,
            role: "assistant",
          })
          return options.channel.sendMessage(chatId, text, sendOptions)
        },
      })
      if (handled) return
    } catch (error) {
      appendSessionErrorLog({
        sessionDir,
        sessionId,
        phase: "command",
        error,
        context: {
          rawCommand,
          chatId: options.message.chat.id,
          messageId: options.message.messageId,
        },
      })
      options.monitor?.notePhase("send", sessionId)
      const errorText = formatErrorReply({
        config: options.config,
        user: options.message.from,
        error,
      })
      options.monitor?.noteOutgoingMessage({
        sessionId,
        text: errorText,
        role: "error",
      })
      await options.channel.sendMessage(
        options.message.chat.id,
        errorText,
        buildReplyOptions(options.message),
      )
      return
    }
  }

  const historyBefore = loadAllMessages(sessionDir)
  const contextState = options.config.contextCompaction.enabled
    ? prepareSessionContext({
        sessionDir,
        sessionId,
        messages: historyBefore,
        maxHistoryMessages: options.config.contextCompaction.maxHistoryMessages,
        maxHistoryChars: options.config.contextCompaction.maxHistoryChars,
        summaryMaxMessages: options.config.contextCompaction.summaryMaxMessages,
        summaryMaxChars: options.config.contextCompaction.summaryMaxChars,
        compressionCooldownMs: options.config.contextCompaction.compressionCooldownMs,
        contextWindowTokens: options.config.ai.limits.contextWindow,
        maxOutputTokens: options.config.ai.limits.maxOutputTokens,
      })
    : {
        history: historyBefore,
        summary: "",
        compressed: false,
      }
  if (contextState.compressed) {
    metadata.lastCompressionAt = new Date().toISOString()
    saveSessionMetadata(sessionDir, metadata)
  }

  const incoming = await buildIncomingMessage({
    config: options.config,
    message: options.message,
    sessionDir,
  })
  const userMessage = createUserMessage(sessionId, incoming.content, incoming.metadata)
  options.monitor?.noteIncomingMessage({
    sessionId,
    text: userMessage.content,
    role: "user",
  })
  const agent = createBotAssistantAgent({
    workspaceRoot: options.config.workspaceRoot,
  })
  const systemMessage = createSystemMessage(
    sessionId,
    agent.buildSystemPrompt({
      replyMode: options.shouldReply ? "required" : "optional",
      scope: route.scope,
      sessionWorkspace,
      user: {
        userId,
        chatId: options.message.chat.id,
        username: options.message.from?.username,
        firstName: options.message.from?.firstName,
        lastName: options.message.from?.lastName,
      },
    }),
    {
      source: "bot",
      agent: agent.id,
      compressed: contextState.compressed,
    },
  )
  const contextPrompt = agent.buildContextPrompt({
    conversationSummary: contextState.summary,
    replyMode: options.shouldReply ? "required" : "optional",
    scope: route.scope,
    sessionWorkspace,
    user: {
      userId,
      chatId: options.message.chat.id,
      username: options.message.from?.username,
      firstName: options.message.from?.firstName,
      lastName: options.message.from?.lastName,
    },
  })
  const contextMessage = contextPrompt
    ? createUserMessage(sessionId, contextPrompt, {
        type: "context_injection",
        source: "bot",
        hiddenFromHistory: true,
      })
    : null

  appendMessage(sessionDir, userMessage)

  try {
    const progressNotifier = options.shouldReply
      ? createToolProgressNotifier({
          config: options.config,
          channel: options.channel,
          sessionDir,
          sessionId,
          chatId: options.message.chat.id,
          latestUserInput: userMessage.content,
          sendOptions: buildReplyOptions(options.message),
          onProgressMessageSent: ({ text }) => {
            options.monitor?.noteOutgoingMessage({
              sessionId,
              text,
              role: "progress",
            })
          },
        })
      : null
    options.monitor?.notePhase("llm", sessionId)
    const preparedMessages = agent.prepareMessages({
      systemMessage,
      history: contextState.history,
      contextMessage,
      userMessage,
    })
    const request = options.monitor?.noteRequestStart({
      sessionId,
      source: "conversation",
      messages: preparedMessages,
    })
    const reply = await generateReply({
      config: options.config,
      messages: preparedMessages,
      sessionId,
      onToolCallMessage: progressNotifier
        ? (message) => {
            options.monitor?.notePhase("tool", sessionId)
            progressNotifier.onToolCallMessage(message)
          }
        : undefined,
      onToolResultMessage: progressNotifier
        ? (message) => {
            options.monitor?.notePhase("llm", sessionId)
            progressNotifier.onToolResultMessage(message)
          }
        : undefined,
    })
    if (request) {
      options.monitor?.noteRequestComplete({
        sessionId,
        source: "conversation",
        startedAt: request.startedAt,
        requestId: request.requestId,
        usage: reply.usage as TokenUsage | undefined,
        toolCallCount: Array.isArray(reply.toolCalls) ? reply.toolCalls.length : 0,
      })
    }
    if (progressNotifier) {
      await progressNotifier.flush()
    }

    if (Array.isArray(reply.toolTrace) && reply.toolTrace.length) {
      appendToolMessagesToSessionHistory({
        sessionId,
        sessionDir,
        trace: reply.toolTrace as Array<{
          role: string
          content: unknown
          tool_calls?: unknown
          tool_call_id?: unknown
          metadata?: Record<string, unknown>
        }>,
      })
      appendToolAuditTrace({
        sessionId,
        sessionDir,
        trace: reply.toolTrace as Array<{
          role: string
          content: unknown
          tool_calls?: unknown
          tool_call_id?: unknown
          metadata?: Record<string, unknown>
        }>,
      })
    }

    const assistantMessage = createAssistantMessage(
      sessionId,
      reply.content || "(无响应)",
      {
        toolCallCount: Array.isArray(reply.toolCalls)
          ? reply.toolCalls.length
          : 0,
        usage: reply.usage as TokenUsage | undefined,
        ...(reply.responseId
          ? {
              providerResponseId: reply.responseId,
              providerResponseResumable: Boolean(reply.responseResumable),
            }
          : {}),
        ...(reply.previousResponseId
          ? { providerPreviousResponseId: reply.previousResponseId }
          : {}),
        ...(reply.promptCacheKey
          ? { providerPromptCacheKey: reply.promptCacheKey }
          : {}),
      },
    )
    if (Array.isArray(reply.toolCalls) && reply.toolCalls.length) {
      assistantMessage.tool_calls = reply.toolCalls as Message["tool_calls"]
    }
    const replySuppressed = !options.shouldReply && isNoReplyContent(reply.content || "")
    if (!replySuppressed) {
      options.monitor?.notePhase("send", sessionId)
      options.monitor?.noteOutgoingMessage({
        sessionId,
        text: assistantMessage.content,
        role: "assistant",
      })
      appendMessage(sessionDir, assistantMessage)
      await options.channel.sendMessage(
        options.message.chat.id,
        assistantMessage.content,
        buildReplyOptions(options.message),
      )
    }
    options.monitor?.notePhase("idle", sessionId)
  } catch (error) {
    options.monitor?.noteError({
      sessionId,
      error,
    })
    const normalized = appendSessionErrorLog({
      sessionDir,
      sessionId,
      phase: "conversation",
      error,
      context: {
        chatId: options.message.chat.id,
        messageId: options.message.messageId,
        shouldReply: options.shouldReply,
      },
    })
    const canSendErrorReply =
      options.shouldReply || isAdminUser(options.config, options.message.from)
    try {
      if (canSendErrorReply) {
        const assistantMessage = createAssistantMessage(
          sessionId,
          formatErrorReply({
            config: options.config,
            user: options.message.from,
            error,
          }),
          { error: normalized.message },
        )
        options.monitor?.notePhase("send", sessionId)
        options.monitor?.noteOutgoingMessage({
          sessionId,
          text: assistantMessage.content,
          role: "error",
        })
        appendMessage(sessionDir, assistantMessage)
        await options.channel.sendMessage(
          options.message.chat.id,
          assistantMessage.content,
          buildReplyOptions(options.message),
        )
      }
    } finally {
      options.monitor?.notePhase("idle", sessionId)
    }
  }
}

export async function serveBot(options: { workspaceRoot?: string; enableTui?: boolean } = {}) {
  const config = loadConfig({
    workspaceRoot: options.workspaceRoot,
  })
  configureGlobalNetwork(config.network)
  mkdirSync(config.sessionsDir, { recursive: true })
  mkdirSync(config.attachmentsDir, { recursive: true })
  mkdirSync(config.permissionsDir, { recursive: true })
  mkdirSync(config.soulRuntimeDir, { recursive: true })
  mkdirSync(config.systemDir, { recursive: true })
  mkdirSync(config.knowledgeDir, { recursive: true })
  syncUpgradeState(config)

  const channel = createTuiAwareChannelClient({
    config,
  })
  registerLocalTools(
    createLocalTools({
      workspaceRoot: config.workspaceRoot,
      runtimeRoot: config.workspaceRuntimeRoot,
      skillSources: config.skillSources,
      skillAllowlist: config.skillAllowlist,
      skillDenylist: config.skillDenylist,
      toolAllowlist: config.toolAllowlist,
      toolDenylist: config.toolDenylist,
      memoryDir: config.memoryDir,
      knowledgeDir: config.knowledgeDir,
      sessionsDir: config.sessionsDir,
      attachmentsDir: config.attachmentsDir,
      channel,
    }),
  )
  const botUsername = "local"
  const monitor = createRuntimeMonitor({
    provider: config.ai.provider,
    model: config.ai.model,
    streamingEnabled: config.ai.streamingEnabled !== false,
    historyMode: config.contextCompaction.enabled
      ? `summary-compaction(${config.contextCompaction.maxHistoryMessages})`
      : "full-history",
    contextCompactionStatus: config.contextCompaction.enabled ? "summary-only" : "disabled",
    enabled: resolveTuiEnabled(options.enableTui),
    input: process.stdin,
  })
  const scheduler =
    config.scheduler.enabled
      ? startTaskScheduler({
          config,
          channel,
          monitor,
        })
      : null
  const localTuiChannel = startLocalTuiChannel({
    config,
    enabled: config.channels.tui.enabled && resolveTuiEnabled(options.enableTui),
    monitor,
    onMessage: async (message) => {
      await handleSessionMessage({
        config,
        channel,
        message,
        botUsername,
        shouldReply: true,
        monitor,
      })
    },
  })

  if (!localTuiChannel.enabled) {
    throw new Error("No active chat channel: run with an interactive TUI")
  }

  await new Promise<void>(() => undefined)

  scheduler?.stop()
  localTuiChannel.close()
  monitor.close()
}
