import { mkdirSync } from "node:fs"
import type { Message, TokenUsage } from "@myz/ai-core/types"
import { registerLocalTools } from "@myz/ai-core/tools/registry"
import { createBotAssistantAgent } from "./agents/botAssistant"
import { generateReply } from "./ai"
import { loadChatChronicle } from "./chatChronicle"
import { loadConfig, type BotRuntimeConfig } from "./config"
import { recoverContextIfNeeded } from "./contextRecovery"
import {
  appendMessage,
  appendTraceMessage,
  createAssistantMessage,
  createSystemMessage,
  createToolMessage,
  createUserMessage,
  ensureConversationDir,
  ensureConversationWorkspaceDir,
  loadAllMessages,
  loadMetadata,
  saveMetadata,
  type ConversationMetadata,
} from "./conversations"
import { prepareConversationContext } from "./context"
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
  didToolTraceRemember,
  ensureMemoryDir,
  isExplicitMemoryRequest,
  rememberConversationExchange,
  renderMemoryContext,
} from "./memory"
import {
  renderRelationshipContext,
  touchRelationshipRecord,
} from "./relationships"
import {
  collectTokenUsageSummary,
  formatBotRuntimeStatus,
  formatHousekeepingResult,
  formatMemoryResetResult,
  formatTokenUsageSummary,
  getBotRuntimeStatus,
  requestProcessRestart,
  resetAllMemory,
  resetConversationMemory,
  runHousekeeping,
} from "./maintenance"
import {
  authorizeMessage,
  evaluateMessageHandling,
  extractCommandText,
  isAdminUser,
} from "./permissions"
import { configureGlobalNetwork } from "./network"
import {
  generateSoulDraftContent,
  processConversationReflectionPass,
} from "./conversationReflections"
import { sendRecordedTelegramMessage } from "./telegramDelivery"
import {
  applySoulDraft,
  createSoulDraft,
  listSoulDrafts,
  loadSoul,
  readSoulDraft,
} from "./soul"
import { recordIncomingTelegramMessage } from "./telegramHistory"
import { buildReplyOptions } from "./replyOptions"
import { createToolProgressNotifier } from "./toolProgress"
import {
  listSkills,
  readSkillFile,
  type SkillInfo,
} from "./skills"
import { resolveConversationRoute } from "./routing"
import { startTaskScheduler } from "./scheduler"
import { createTelegramClient, type TelegramMessage } from "./telegram"
import {
  ensureConversationTaskFiles,
  formatTasksForChat,
  listConversationTasks,
  updateScheduledTask,
} from "./tasks"
import { createLocalTools } from "./tools"

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
  message: TelegramMessage
  rawCommand: string
  botUsername: string
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
        `${formatTasksForChat(tasks)}\n\nTODO 视图：/bot/conversations/${options.conversationId}/TODO.md`,
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

    if (action === "reset-memory") {
      const result =
        normalizedScope === "all"
          ? resetAllMemory(options.config.memoryDir)
          : resetConversationMemory(options.config.memoryDir, options.conversationId)
      await options.sendMessage(
        options.message.chat.id,
        formatMemoryResetResult(result),
        buildReplyOptions(options.message),
      )
      return true
    }

    if (action === "housekeeping") {
      const result = runHousekeeping({
        conversationsDir: options.config.conversationsDir,
        scope: normalizedScope,
        conversationId: options.conversationId,
      })
      await options.sendMessage(
        options.message.chat.id,
        formatHousekeepingResult(result),
        buildReplyOptions(options.message),
      )
      return true
    }

    if (action === "restart") {
      await options.sendMessage(
        options.message.chat.id,
        "已请求重启当前进程；若外部有 supervisor，将由外部拉起新进程。",
        buildReplyOptions(options.message),
      )
      requestProcessRestart()
      return true
    }

    await options.sendMessage(
      options.message.chat.id,
      "可用命令：/ops status | /ops usage [current|all] | /ops reset-memory [current|all] | /ops housekeeping [current|all] | /ops restart",
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
        options.config.workspaceRoot,
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
      const grants = listElevatedPermissionGrants(options.config.workspaceRoot)
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
        workspaceRoot: options.config.workspaceRoot,
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
        workspaceRoot: options.config.workspaceRoot,
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
        workspaceRoot: options.config.workspaceRoot,
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
        workspaceRoot: options.config.workspaceRoot,
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
    const drafts = listSoulDrafts(options.config.workspaceRoot)
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
    const draft = createSoulDraft(options.config.workspaceRoot, content, {
      actor,
      trigger: "manual",
      conversationId: options.conversationId,
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
    applySoulDraft(options.config.workspaceRoot, draftId, {
      actor: options.message.from?.username || String(options.message.from?.id || "admin"),
    })
    const preview = readSoulDraft(options.config.workspaceRoot, draftId)
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

function appendToolTrace(options: {
  conversationId: string
  conversationDir: string
  trace: Array<{
    role: string
    content: unknown
    tool_calls?: unknown
    tool_call_id?: unknown
    metadata?: Record<string, unknown>
  }>
}) {
  options.trace.forEach((entry) => {
    if (entry.role === "assistant" && Array.isArray(entry.tool_calls)) {
      const assistantMessage = createAssistantMessage(
        options.conversationId,
        typeof entry.content === "string" ? entry.content : "",
        {
          type: "tool_audit",
          toolInvocationOnly: true,
          auditedAt: new Date().toISOString(),
          ...(entry.metadata || {}),
        },
      )
      assistantMessage.tool_calls = entry.tool_calls as Message["tool_calls"]
      appendTraceMessage(options.conversationDir, assistantMessage)
      return
    }

    if (entry.role === "tool" && typeof entry.tool_call_id === "string") {
      const toolMessage = createToolMessage(
        options.conversationId,
        typeof entry.content === "string" ? entry.content : "",
        entry.tool_call_id,
        {
          type: "tool_audit",
          auditedAt: new Date().toISOString(),
          ...(entry.metadata || {}),
        },
      )
      appendTraceMessage(options.conversationDir, toolMessage)
    }
  })
}

async function handleConversationMessage(options: {
  config: BotRuntimeConfig
  telegram: ReturnType<typeof createTelegramClient>
  message: TelegramMessage
  botUsername: string
  shouldReply: boolean
}) {
  const route = resolveConversationRoute(options.message)
  const userId = route.actorUserId
  const conversationId = route.conversationId
  const conversationDir = ensureConversationDir(
    options.config.conversationsDir,
    conversationId,
  )
  ensureConversationTaskFiles(conversationDir, conversationId)
  const sessionWorkspace = ensureConversationWorkspaceDir(
    options.config.conversationsDir,
    conversationId,
  )

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
    firstName: options.message.from?.first_name,
    lastName: options.message.from?.last_name,
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
  touchRelationshipRecord({
    workspaceRoot: options.config.workspaceRoot,
    conversationId,
    scope: route.scope,
    chatId: options.message.chat.id,
    actorUserId: route.actorUserId,
    username: options.message.from?.username,
    firstName: options.message.from?.first_name,
    lastName: options.message.from?.last_name,
    displayName: route.actorDisplayName,
  })

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
        sendMessage: (chatId, text, sendOptions) =>
          sendRecordedTelegramMessage({
            telegram: options.telegram,
            conversationDir,
            conversationId,
            chatId,
            text,
            sendOptions,
            kind: "command",
          }),
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
          messageId: options.message.message_id,
        },
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
  const contextState = prepareConversationContext({
    conversationDir,
    conversationId,
    memoryDir: options.config.memoryDir,
    messages: historyBefore,
    maxHistoryMessages: options.config.context.maxHistoryMessages,
    maxHistoryChars: options.config.context.maxHistoryChars,
    compressionThreshold: options.config.context.compressionThreshold,
    compressionCooldownMs: options.config.context.compressionCooldownMs,
    summaryMaxMessages: options.config.context.summaryMaxMessages,
    summaryMaxChars: options.config.context.summaryMaxChars,
  })
  if (contextState.compressed) {
    metadata.lastCompressionAt = new Date().toISOString()
    saveMetadata(conversationDir, metadata)
  }

  const visibleSkills = loadVisibleSkills(options.config)
  const incoming = await buildIncomingMessage({
    config: options.config,
    telegram: options.telegram,
    message: options.message,
    conversationDir,
  })
  const userMessage = createUserMessage(conversationId, incoming.content, {
    ...incoming.metadata,
    skillList: visibleSkills,
  })
  const chatChronicle = loadChatChronicle(conversationDir)
  const recoveredContextState = await recoverContextIfNeeded({
    config: options.config,
    conversationId,
    conversationDir,
    memoryDir: options.config.memoryDir,
    workspaceRoot: options.config.workspaceRoot,
    actorUserId: route.actorUserId,
    username: options.message.from?.username,
    latestUserInput: incoming.content,
    runtimeHistoryLength: contextState.history.length,
    maxHistoryMessages: options.config.context.maxHistoryMessages,
  })
  const relationshipContext = renderRelationshipContext({
    workspaceRoot: options.config.workspaceRoot,
    actorUserId: route.actorUserId,
    username: options.message.from?.username,
  })
  const agent = createBotAssistantAgent({
    workspaceRoot: options.config.workspaceRoot,
  })
  const systemMessage = createSystemMessage(
    conversationId,
    agent.buildSystemPrompt({
      memoryContext: renderMemoryContext(options.config.memoryDir),
      relationshipContext,
      conversationSummary: contextState.summary,
      chatChronicle,
      recoveredContext: recoveredContextState.recoveredContext,
      replyMode: options.shouldReply ? "required" : "optional",
      scope: route.scope,
      sessionWorkspace,
      user: {
        userId,
        chatId: options.message.chat.id,
        username: options.message.from?.username,
        firstName: options.message.from?.first_name,
        lastName: options.message.from?.last_name,
      },
    }),
    {
      source: "bot",
      agent: agent.id,
      compressed: contextState.compressed,
    },
  )

  appendMessage(conversationDir, userMessage)

  try {
    const progressNotifier = options.shouldReply
      ? createToolProgressNotifier({
          config: options.config,
          telegram: options.telegram,
          conversationDir,
          conversationId,
          chatId: options.message.chat.id,
          latestUserInput: userMessage.content,
          soul: loadSoul(options.config.workspaceRoot),
          sendOptions: buildReplyOptions(options.message),
        })
      : null
    const reply = await generateReply({
      config: options.config,
      messages: agent.prepareMessages({
        systemMessage,
        history: contextState.history,
        userMessage,
      }),
      conversationId,
      onToolCallMessage: progressNotifier
        ? (message) => progressNotifier.onToolCallMessage(message)
        : undefined,
      onToolResultMessage: progressNotifier
        ? (message) => progressNotifier.onToolResultMessage(message)
        : undefined,
    })
    if (progressNotifier) {
      await progressNotifier.flush()
    }

    if (Array.isArray(reply.toolTrace) && reply.toolTrace.length) {
      appendToolTrace({
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

    const autoRemembered =
      isExplicitMemoryRequest(userMessage.content) &&
      !didToolTraceRemember(
        Array.isArray(reply.toolTrace)
          ? (reply.toolTrace as Array<{
              role?: string
              metadata?: Record<string, unknown>
              tool_calls?: Array<{ function?: { name?: string } }>
            }>)
          : [],
      )
        ? rememberConversationExchange({
            memoryDir: options.config.memoryDir,
            conversationId,
            userContent: userMessage.content,
            assistantContent: reply.content || "",
            tags: ["explicit-request"],
          })
        : null

    const assistantMessage = createAssistantMessage(
      conversationId,
      reply.content || "(无响应)",
      {
        toolCallCount: Array.isArray(reply.toolCalls)
          ? reply.toolCalls.length
          : 0,
        usage: reply.usage as TokenUsage | undefined,
        ...(autoRemembered
          ? {
              memorySaved: true,
              memoryId: autoRemembered.id,
              memoryDeduplicated: Boolean(autoRemembered.deduplicated),
            }
          : {}),
      },
    )
    if (Array.isArray(reply.toolCalls) && reply.toolCalls.length) {
      assistantMessage.tool_calls = reply.toolCalls as Message["tool_calls"]
    }
    const replySuppressed = !options.shouldReply && isNoReplyContent(reply.content || "")
    if (!replySuppressed) {
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

    const allMessages = loadAllMessages(conversationDir)
    try {
      const reflection = await processConversationReflectionPass({
        config: options.config,
        conversationId,
        conversationDir,
        identity: {
          actorUserId: route.actorUserId,
          chatId: options.message.chat.id,
          username: options.message.from?.username,
          firstName: options.message.from?.first_name,
          lastName: options.message.from?.last_name,
          displayName: route.actorDisplayName,
          scope: route.scope,
        },
        actor: "auto",
      })
      if (
        reflection.autoDraft.triggered &&
        reflection.autoDraft.applied === false &&
        reflection.autoDraft.draftId &&
        isAdminUser(options.config, options.message.from)
      ) {
        await sendRecordedTelegramMessage({
          telegram: options.telegram,
          conversationDir,
          conversationId,
          chatId: options.message.chat.id,
          text: `已自动生成 SOUL 草案：${reflection.autoDraft.draftId}`,
          sendOptions: buildReplyOptions(options.message),
          kind: "command",
        })
      }
    } catch (error) {
      appendConversationErrorLog({
        conversationDir,
        conversationId,
        phase: "growth_feedback_batch",
        error,
        context: {
          visibleMessageCount: allMessages.length,
        },
      })
    }
  } catch (error) {
    const normalized = appendConversationErrorLog({
      conversationDir,
      conversationId,
      phase: "conversation",
      error,
      context: {
        chatId: options.message.chat.id,
        messageId: options.message.message_id,
        shouldReply: options.shouldReply,
      },
    })
    const canSendErrorReply =
      options.shouldReply || isAdminUser(options.config, options.message.from)
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
  }
}

export async function serveBot(options: { configPath?: string } = {}) {
  const config = loadConfig(options.configPath)
  configureGlobalNetwork(config.network)
  mkdirSync(config.conversationsDir, { recursive: true })
  ensureMemoryDir(config.memoryDir)

  const telegram = createTelegramClient({
    token: config.telegram.token,
    timeoutSeconds: config.telegram.timeoutSeconds,
    retry: config.telegram.retry,
  })
  registerLocalTools(
    createLocalTools({
      workspaceRoot: config.workspaceRoot,
      skillSources: config.skillSources,
      skillAllowlist: config.skillAllowlist,
      skillDenylist: config.skillDenylist,
      toolAllowlist: config.toolAllowlist,
      toolDenylist: config.toolDenylist,
      memoryDir: config.memoryDir,
      conversationsDir: config.conversationsDir,
      adminUsers: config.telegram.adminUsers,
      telegram,
    }),
  )
  const botProfile = await telegram.getMe()
  const botUsername = botProfile.username || config.telegram.username
  let offset = 0
  const scheduler =
    config.scheduler.enabled
      ? startTaskScheduler({
          config,
          telegram,
        })
      : null

  while (true) {
    try {
      const updates = await telegram.getUpdates(offset)
      for (const update of updates) {
        offset = update.update_id + 1
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
            telegram,
            message,
            botUsername,
            shouldReply: handling.shouldReply,
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
              messageId: message.message_id,
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
      console.error("Telegram polling failed:", normalized.message, normalized.stack || "")
    }
  }

  scheduler?.stop()
}
