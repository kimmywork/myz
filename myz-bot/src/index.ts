import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import type { Message, TokenUsage } from "@myz/ai-core/types"
import { registerLocalTools } from "@myz/ai-core/tools/registry"
import type {
  ChatChannelClient,
  ChatFile,
  ChatMediaClient,
  ChatMessage,
  ChatUser,
} from "./chatChannel"
import { createBotAssistantAgent } from "./agents/botAssistant"
import { generateReply } from "./ai"
import { loadConfig, type BotRuntimeConfig } from "./config"
import {
  appendMessage,
  appendTraceMessage,
  createAssistantMessage,
  createSystemMessage,
  createToolMessage,
  createUserMessage,
  ensureConversationDir,
  loadAllMessages,
  loadMetadata,
  saveMetadata,
  type ConversationMetadata,
} from "./conversations"
import { prepareConversationContext } from "./contextCompaction"
import {
  formatSupportedBotCommands,
  isPassthroughBotCommandName,
  isSupportedBotCommandName,
  parseBotCommand,
} from "./commands"
import {
  appendConversationErrorLog,
  formatErrorReply,
  normalizeError,
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
  authorizeMessage,
  evaluateMessageHandling,
  extractCommandText,
  isAdminUser,
} from "./permissions"
import { configureGlobalNetwork } from "./network"
import { generateSoulDraftContent } from "./soulDraftGenerator"
import { sendRecordedTelegramMessage } from "./telegramDelivery"
import {
  applySoulDraft,
  createSoulDraft,
  listSoulDrafts,
  readSoulDraft,
} from "./soul"
import { recordIncomingTelegramMessage } from "./telegramHistory"
import { buildReplyOptions } from "./replyOptions"
import { createToolProgressNotifier } from "./toolProgress"
import { createTelegramFeedbackController } from "./telegramFeedback"
import {
  listSkills,
  readSkillFile,
  type SkillInfo,
} from "./skills"
import { resolveConversationRoute } from "./routing"
import { startTaskScheduler } from "./scheduler"
import { createTelegramClient } from "./telegram"
import {
  ensureConversationTaskFiles,
  formatTasksForChat,
  listConversationTasks,
  updateScheduledTask,
} from "./tasks"
import {
  appendToolAuditTrace,
  appendToolMessagesToHistory,
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
  conversationId: string
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
    const conversationDir = ensureConversationDir(
      options.config.conversationsDir,
      options.conversationId,
    )
    ensureConversationTaskFiles(conversationDir, options.conversationId)
    const action = (command.args[0] || "list").toLowerCase()

    if (action === "list" || action === "show") {
      const tasks = listConversationTasks({
        conversationDir,
        conversationId: options.conversationId,
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
        conversationDir,
        conversationId: options.conversationId,
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
        conversationDir,
        conversationId: options.conversationId,
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
        conversationDir,
        conversationId: options.conversationId,
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
        conversationDir,
        conversationId: options.conversationId,
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
            conversationId: options.conversationId,
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
      ensureConversationDir(options.config.conversationsDir, options.conversationId),
    )
    const actor = options.message.from?.username || String(options.message.from?.id || "admin")
    const content = await generateSoulDraftContent({
      config: options.config,
      conversationId: options.conversationId,
      recentMessages: existingMessages,
      actor,
    })
    const draft = createSoulDraft({
      runtimeRoot: options.config.workspaceRuntimeRoot,
      content,
      metadata: {
        actor,
        trigger: "manual",
        conversationId: options.conversationId,
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

async function handleConversationMessage(options: {
  config: BotRuntimeConfig
  telegram: ChatChannelClient<ChatMessage> & Partial<ChatMediaClient<ChatFile>>
  message: ChatMessage
  botUsername: string
  shouldReply: boolean
  monitor?: RuntimeMonitor
}) {
  const route = resolveConversationRoute(options.message)
  const userId = route.actorUserId
  const conversationId = route.conversationId
  const conversationDir = ensureConversationDir(
    options.config.conversationsDir,
    conversationId,
  )
  ensureConversationTaskFiles(conversationDir, conversationId)
  const sessionWorkspace = options.config.workspaceRoot

  const now = new Date().toISOString()
  const existing = loadMetadata(conversationDir)
  const metadata: ConversationMetadata = existing || {
    schemaVersion: "1.0.0",
    conversationId,
    chatId: options.message.chat.id,
    userId,
    scope: route.scope,
    chatType: options.message.chat.type,
    threadId: route.threadId,
    username: options.message.from?.username,
    firstName: options.message.from?.firstName,
    lastName: options.message.from?.lastName,
    createdAt: now,
    updatedAt: now,
  }
  metadata.updatedAt = now
  metadata.lastMessageAt = now
  metadata.chatType = options.message.chat.type
  metadata.scope = route.scope
  metadata.threadId = route.threadId
  metadata.lastActorUserId = route.actorUserId
  metadata.lastActorDisplayName = route.actorDisplayName
  saveMetadata(conversationDir, metadata)

  const rawCommand = extractCommandText(options.message)
  recordIncomingTelegramMessage({
    conversationDir,
    conversationId,
    message: options.message,
    kind: rawCommand ? "command" : "conversation",
  })
  if (rawCommand) {
    try {
      const handled = await handleCommand({
        config: options.config,
        conversationId,
        message: options.message,
        rawCommand,
        botUsername: options.botUsername,
        monitor: options.monitor,
        sendMessage: (chatId, text, sendOptions) =>
          {
            options.monitor?.notePhase("send", conversationId)
            options.monitor?.noteOutgoingMessage({
              conversationId,
              text,
              role: "assistant",
            })
            return sendRecordedTelegramMessage({
              telegram: options.telegram,
              conversationDir,
              conversationId,
              chatId,
              text,
              sendOptions,
              kind: "command",
            })
          },
      })
      if (handled) return
    } catch (error) {
      appendConversationErrorLog({
        conversationDir,
        conversationId,
        phase: "command",
        error,
        context: {
          rawCommand,
          chatId: options.message.chat.id,
          messageId: options.message.messageId,
        },
      })
      options.monitor?.notePhase("send", conversationId)
      options.monitor?.noteOutgoingMessage({
        conversationId,
        text: formatErrorReply({
          config: options.config,
          user: options.message.from,
          error,
        }),
        role: "error",
      })
      await sendRecordedTelegramMessage({
        telegram: options.telegram,
        conversationDir,
        conversationId,
        chatId: options.message.chat.id,
        text: formatErrorReply({
          config: options.config,
          user: options.message.from,
          error,
        }),
        sendOptions: buildReplyOptions(options.message),
        kind: "error",
      })
      return
    }
  }

  const historyBefore = loadAllMessages(conversationDir)
  const contextState = options.config.contextCompaction.enabled
    ? prepareConversationContext({
        conversationDir,
        conversationId,
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
    saveMetadata(conversationDir, metadata)
  }

  const incoming = await buildIncomingMessage({
    config: options.config,
    telegram: options.telegram,
    message: options.message,
    conversationDir,
  })
  const userMessage = createUserMessage(conversationId, incoming.content, incoming.metadata)
  options.monitor?.noteIncomingMessage({
    conversationId,
    text: userMessage.content,
    role: "user",
  })
  const agent = createBotAssistantAgent({
    workspaceRoot: options.config.workspaceRoot,
  })
  const systemMessage = createSystemMessage(
    conversationId,
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
    ? createUserMessage(conversationId, contextPrompt, {
        type: "context_injection",
        source: "bot",
        hiddenFromHistory: true,
      })
    : null

  appendMessage(conversationDir, userMessage)
  const telegramFeedback = options.shouldReply
    ? createTelegramFeedbackController({
        telegram: options.telegram,
        chatId: options.message.chat.id,
        messageThreadId: options.message.threadId,
        reactionMessageId: options.message.messageId,
      })
    : null

  try {
    const progressNotifier = options.shouldReply
      ? createToolProgressNotifier({
          config: options.config,
          telegram: options.telegram,
          conversationDir,
          conversationId,
          chatId: options.message.chat.id,
          latestUserInput: userMessage.content,
          sendOptions: buildReplyOptions(options.message),
          onProgressMessageSent: ({ text }) => {
            options.monitor?.noteOutgoingMessage({
              conversationId,
              text,
              role: "progress",
            })
          },
        })
      : null
    telegramFeedback?.setPhase("llm")
    options.monitor?.notePhase("llm", conversationId)
    const preparedMessages = agent.prepareMessages({
      systemMessage,
      history: contextState.history,
      contextMessage,
      userMessage,
    })
    const request = options.monitor?.noteRequestStart({
      conversationId,
      source: "conversation",
      messages: preparedMessages,
    })
    const reply = await generateReply({
      config: options.config,
      messages: preparedMessages,
      conversationId,
      onToolCallMessage: progressNotifier
        ? (message) => {
            telegramFeedback?.setPhase("tool")
            options.monitor?.notePhase("tool", conversationId)
            progressNotifier.onToolCallMessage(message)
          }
        : undefined,
      onToolResultMessage: progressNotifier
        ? (message) => {
            telegramFeedback?.noteToolResult(message)
            telegramFeedback?.setPhase("llm")
            options.monitor?.notePhase("llm", conversationId)
            progressNotifier.onToolResultMessage(message)
          }
        : undefined,
    })
    if (request) {
      options.monitor?.noteRequestComplete({
        conversationId,
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
      appendToolMessagesToHistory({
        conversationId,
        conversationDir,
        trace: reply.toolTrace as Array<{
          role: string
          content: unknown
          tool_calls?: unknown
          tool_call_id?: unknown
          metadata?: Record<string, unknown>
        }>,
      })
      appendToolAuditTrace({
        conversationId,
        conversationDir,
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
      conversationId,
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
      options.monitor?.notePhase("send", conversationId)
      options.monitor?.noteOutgoingMessage({
        conversationId,
        text: assistantMessage.content,
        role: "assistant",
      })
      appendMessage(conversationDir, assistantMessage)
      await sendRecordedTelegramMessage({
        telegram: options.telegram,
        conversationDir,
        conversationId,
        chatId: options.message.chat.id,
        text: assistantMessage.content,
        sendOptions: buildReplyOptions(options.message),
        kind: "conversation",
      })
    }
    await telegramFeedback?.complete()
    options.monitor?.notePhase("idle", conversationId)
  } catch (error) {
    options.monitor?.noteError({
      conversationId,
      error,
    })
    const normalized = appendConversationErrorLog({
      conversationDir,
      conversationId,
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
          conversationId,
          formatErrorReply({
            config: options.config,
            user: options.message.from,
            error,
          }),
          { error: normalized.message },
        )
        options.monitor?.notePhase("send", conversationId)
        options.monitor?.noteOutgoingMessage({
          conversationId,
          text: assistantMessage.content,
          role: "error",
        })
        appendMessage(conversationDir, assistantMessage)
        await sendRecordedTelegramMessage({
          telegram: options.telegram,
          conversationDir,
          conversationId,
          chatId: options.message.chat.id,
          text: assistantMessage.content,
          sendOptions: buildReplyOptions(options.message),
          kind: "error",
        })
      }
    } finally {
      await telegramFeedback?.complete({ failed: true })
      options.monitor?.notePhase("idle", conversationId)
    }
  }
}

export async function serveBot(options: { workspaceRoot?: string; enableTui?: boolean } = {}) {
  const config = loadConfig({
    workspaceRoot: options.workspaceRoot,
  })
  configureGlobalNetwork(config.network)
  mkdirSync(config.conversationsDir, { recursive: true })
  mkdirSync(config.attachmentsDir, { recursive: true })
  mkdirSync(config.permissionsDir, { recursive: true })
  mkdirSync(config.soulRuntimeDir, { recursive: true })
  mkdirSync(config.systemDir, { recursive: true })
  syncUpgradeState(config)

  const telegram = config.channels.telegram
    ? createTelegramClient({
        token: config.channels.telegram.token,
        timeoutSeconds: config.channels.telegram.timeoutSeconds,
        retry: config.channels.telegram.retry,
      })
    : null
  const channelTelegram = createTuiAwareChannelClient({
    base: telegram,
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
      conversationsDir: config.conversationsDir,
      attachmentsDir: config.attachmentsDir,
      adminUsers: config.channels.telegram?.adminUsers,
      telegram: channelTelegram,
    }),
  )
  const botProfile = telegram ? await telegram.getMe() : ({ username: "" } as ChatUser)
  const botUsername = botProfile.username || config.channels.telegram?.username || "local"
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
  let offset = 0
  const scheduler =
    config.scheduler.enabled
      ? startTaskScheduler({
          config,
          telegram: channelTelegram,
          monitor,
        })
      : null
  const localTuiChannel = startLocalTuiChannel({
    config,
    enabled: config.channels.tui.enabled && resolveTuiEnabled(options.enableTui),
    monitor,
    onMessage: async (message) => {
      await handleConversationMessage({
        config,
        telegram: channelTelegram,
        message,
        botUsername,
        shouldReply: true,
        monitor,
      })
    },
  })

  if (!telegram && !localTuiChannel.enabled) {
    throw new Error("No active chat channel: configure channels.telegram or run with an interactive TUI")
  }

  while (telegram) {
    try {
      const updates = await telegram.getUpdates(offset)
      for (const update of updates) {
        offset = update.updateId + 1
        const message = update.message
        if (!message) continue
        const handling = evaluateMessageHandling(config, message, botUsername)
        if (!handling.shouldProcess) continue

        const auth = authorizeMessage(config, message)
        if (!auth.ok) {
          if (handling.shouldReply) {
            await telegram.sendMessage(
              message.chat.id,
              auth.replyText,
              buildReplyOptions(message),
            )
          }
          continue
        }

        try {
          await handleConversationMessage({
            config,
            telegram: channelTelegram,
            message,
            botUsername,
            shouldReply: handling.shouldReply,
            monitor,
          })
        } catch (error) {
          const route = resolveConversationRoute(message)
          const conversationDir = ensureConversationDir(
            config.conversationsDir,
            route.conversationId,
          )
          appendConversationErrorLog({
            conversationDir,
            conversationId: route.conversationId,
            phase: "serve_loop",
            error,
            context: {
              chatId: message.chat.id,
              messageId: message.messageId,
            },
          })
          if (handling.shouldReply) {
            await telegram.sendMessage(
              message.chat.id,
              formatErrorReply({
                config,
                user: message.from,
                error,
              }),
              buildReplyOptions(message),
            )
          }
        }
      }
    } catch (error) {
      const normalized = normalizeError(error)
      monitor.noteError({ error: normalized })
      console.error("Telegram polling failed:", normalized.message, normalized.stack || "")
    }
  }

  await new Promise<void>(() => undefined)

  scheduler?.stop()
  localTuiChannel.close()
  monitor.close()
}
