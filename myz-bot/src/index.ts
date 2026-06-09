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
  getActiveSession,
  listSessions,
  type SessionMetadata,
} from "./sessions"
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
import { buildIncomingMessage } from "./incoming"
import {
  extractCommandText,
} from "./permissions"
import { configureGlobalNetwork } from "./network"
import { buildReplyOptions } from "./replyOptions"
import { createToolProgressNotifier } from "./toolProgress"
import {
  listSkills,
  type SkillInfo,
} from "./skills"
import { resolveSessionRoute } from "./routing"
import { createLocalTools } from "./tools"
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
    const sourceId = command.args[0]
    const replyText = formatSkillList(loadVisibleSkills(options.config, sourceId))
    await options.sendMessage(
      options.message.chat.id,
      replyText,
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

  await options.sendMessage(
    options.message.chat.id,
    `未知命令：/${command.name}。可用命令：${formatSupportedBotCommands()}`,
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
    const canSendErrorReply = options.shouldReply
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

  localTuiChannel.close()
  monitor.close()
}
