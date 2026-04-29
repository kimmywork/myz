import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Message } from "@myz/ai-core/types"
import { rewriteLlmHistory } from "./conversations"

const ESTIMATED_CHARS_PER_TOKEN = 4
const CONTEXT_RESERVED_TOKENS = 2048
const CONTEXT_HISTORY_RATIO = 0.6
const DEFAULT_MAX_HISTORY_MESSAGES = 120
const DEFAULT_MAX_HISTORY_CHARS = 120_000
const DEFAULT_COMPRESSION_COOLDOWN_MS = 300_000
const DEFAULT_SUMMARY_MAX_MESSAGES = 20
const DEFAULT_SUMMARY_MAX_CHARS = 6_000

function isVisibleConversationMessage(message: Message) {
  if (message.role === "user") return true
  if (message.role !== "assistant") return false
  return message.metadata?.type !== "tool_audit"
}

function isRuntimeHistoryMessage(message: Message) {
  if (message.role === "system") return true
  if (message.role === "user") return true
  if (message.role === "tool") return true
  if (message.role === "assistant") return message.metadata?.type !== "tool_audit"
  return false
}

function summarizeMessage(message: Message, index: number) {
  const content = typeof message.content === "string" ? message.content.trim() : ""
  const snippet = content.replace(/\s+/g, " ").slice(0, 160)
  const toolName =
    typeof message.metadata?.toolName === "string" ? message.metadata.toolName : ""
  const prefix = toolName ? `${message.role}:${toolName}` : message.role
  return `${index + 1}. ${prefix} ${snippet}`.trim()
}

function getContextPaths(conversationDir: string) {
  const dir = resolve(conversationDir, "context")
  return {
    dir,
    summaryFile: resolve(dir, "summary.json"),
  }
}

function estimateMessageChars(message: Message) {
  const content = typeof message.content === "string" ? message.content.length : 0
  const toolCalls = Array.isArray(message.tool_calls)
    ? JSON.stringify(message.tool_calls).length
    : 0
  return content + toolCalls + 64
}

function estimateHistoryChars(messages: Message[]) {
  return messages.reduce((sum, message) => sum + estimateMessageChars(message), 0)
}

function deriveHistoryCharBudget(options: {
  maxHistoryChars: number
  contextWindowTokens?: number
  maxOutputTokens?: number
}) {
  const configured = Math.max(4096, options.maxHistoryChars)
  const contextWindowTokens =
    typeof options.contextWindowTokens === "number" &&
    Number.isFinite(options.contextWindowTokens)
      ? options.contextWindowTokens
      : 0
  if (contextWindowTokens <= 0) {
    return configured
  }

  const maxOutputTokens =
    typeof options.maxOutputTokens === "number" && Number.isFinite(options.maxOutputTokens)
      ? options.maxOutputTokens
      : 0
  const reservedTokens = Math.max(1024, maxOutputTokens + CONTEXT_RESERVED_TOKENS)
  const remainingTokens = Math.max(1024, contextWindowTokens - reservedTokens)
  const derived = Math.max(
    4096,
    Math.floor(remainingTokens * CONTEXT_HISTORY_RATIO * ESTIMATED_CHARS_PER_TOKEN),
  )
  return Math.min(configured, derived)
}

function deriveAdaptiveMessageBudget(maxHistoryChars: number, configuredMaxHistoryMessages: number) {
  const derived = Math.max(12, Math.ceil(maxHistoryChars / 300))
  return Math.max(1, Math.max(configuredMaxHistoryMessages, derived))
}

function deriveCompressionKeepMessages(maxHistoryMessages: number) {
  return Math.max(1, Math.min(maxHistoryMessages, Math.max(2, Math.ceil(maxHistoryMessages / 6))))
}

function deriveCompressionKeepChars(maxHistoryChars: number) {
  return Math.max(2048, Math.min(maxHistoryChars, Math.floor(maxHistoryChars / 6)))
}

function hasMatchingToolCall(messages: Message[], toolCallId: string) {
  return messages.some((message) => {
    if (message.role !== "assistant" || !Array.isArray(message.tool_calls)) {
      return false
    }
    return message.tool_calls.some((toolCall) => toolCall?.id === toolCallId)
  })
}

function normalizeMessagesForToolChains(messages: Message[]) {
  const outputIds = new Set(
    messages
      .filter(
        (message) => message.role === "tool" && typeof message.tool_call_id === "string",
      )
      .map((message) => message.tool_call_id as string),
  )
  const normalized: Message[] = []
  const activeCallIds = new Set<string>()

  messages.forEach((message) => {
    if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
      const matchedToolCalls = message.tool_calls.filter((toolCall) => {
        return (
          typeof toolCall?.id === "string" &&
          outputIds.has(toolCall.id) &&
          hasMatchingToolCall(messages, toolCall.id)
        )
      })
      const content = typeof message.content === "string" ? message.content : ""
      if (!matchedToolCalls.length && !content.trim()) {
        return
      }
      const nextMessage =
        matchedToolCalls.length === message.tool_calls.length
          ? message
          : ({
              ...message,
              ...(matchedToolCalls.length ? { tool_calls: matchedToolCalls } : {}),
            } satisfies Message)
      if (!matchedToolCalls.length) {
        delete nextMessage.tool_calls
      }
      normalized.push(nextMessage)
      matchedToolCalls.forEach((toolCall) => {
        if (typeof toolCall?.id === "string") {
          activeCallIds.add(toolCall.id)
        }
      })
      return
    }

    if (message.role === "tool") {
      const callId = typeof message.tool_call_id === "string" ? message.tool_call_id : ""
      if (!callId || !activeCallIds.has(callId)) {
        return
      }
      normalized.push(message)
      activeCallIds.delete(callId)
      return
    }

    normalized.push(message)
  })

  return normalized
}

function takeRecentMessagesWithinBudget(
  messages: Message[],
  maxHistoryMessages: number,
  maxHistoryChars: number,
) {
  const capped: Message[] = []
  let chars = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message) continue
    const nextChars = chars + estimateMessageChars(message)
    if (
      capped.length >= Math.max(1, maxHistoryMessages) ||
      (capped.length > 0 && nextChars > Math.max(1024, maxHistoryChars))
    ) {
      break
    }
    capped.unshift(message)
    chars = nextChars
  }

  return {
    startIndex: Math.max(0, messages.length - capped.length),
    messages: normalizeMessagesForToolChains(capped),
  }
}

function trimSummary(summary: string, maxChars: number) {
  if (summary.length <= maxChars) return summary
  return `${summary.slice(0, maxChars - 32).trim()}\n\n[摘要已截断]`
}

function withSummaryHeading(summary: string) {
  const normalized = summary.trim()
  if (!normalized) return ""
  if (normalized.startsWith("会话压缩摘要")) return normalized
  return `会话压缩摘要\n\n${normalized}`
}

function loadStoredSummary(summaryFile: string) {
  if (!existsSync(summaryFile)) {
    return { summary: "", updatedAt: "" }
  }
  try {
    const parsed = JSON.parse(readFileSync(summaryFile, "utf-8")) as {
      summary?: string
      updatedAt?: string
    }
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    }
  } catch {
    return { summary: "", updatedAt: "" }
  }
}

export function prepareConversationContext(options: {
  conversationDir: string
  conversationId: string
  messages: Message[]
  maxHistoryMessages?: number
  summaryMaxMessages?: number
  summaryMaxChars?: number
  maxHistoryChars?: number
  compressionCooldownMs?: number
  contextWindowTokens?: number
  maxOutputTokens?: number
}) {
  const {
    conversationDir,
    conversationId,
    messages,
    maxHistoryMessages = DEFAULT_MAX_HISTORY_MESSAGES,
    summaryMaxMessages = DEFAULT_SUMMARY_MAX_MESSAGES,
    summaryMaxChars = DEFAULT_SUMMARY_MAX_CHARS,
    maxHistoryChars = DEFAULT_MAX_HISTORY_CHARS,
    compressionCooldownMs = DEFAULT_COMPRESSION_COOLDOWN_MS,
    contextWindowTokens,
    maxOutputTokens,
  } = options

  const runtimeMessages = messages.filter(isRuntimeHistoryMessage)
  const effectiveMaxHistoryChars = deriveHistoryCharBudget({
    maxHistoryChars,
    contextWindowTokens,
    maxOutputTokens,
  })
  const effectiveMaxHistoryMessages = deriveAdaptiveMessageBudget(
    effectiveMaxHistoryChars,
    Math.max(1, maxHistoryMessages),
  )
  const compressionKeepMessages = deriveCompressionKeepMessages(effectiveMaxHistoryMessages)
  const compressionKeepChars = deriveCompressionKeepChars(effectiveMaxHistoryChars)
  const paths = getContextPaths(conversationDir)
  const previousSummaryState = loadStoredSummary(paths.summaryFile)
  const previousSummary = previousSummaryState.summary
  const recentHistoryState = takeRecentMessagesWithinBudget(
    runtimeMessages,
    effectiveMaxHistoryMessages,
    effectiveMaxHistoryChars,
  )
  const compressedRecentHistoryState = takeRecentMessagesWithinBudget(
    runtimeMessages,
    compressionKeepMessages,
    compressionKeepChars,
  )
  const recentHistory = recentHistoryState.messages
  const compressedRecentHistory = compressedRecentHistoryState.messages
  const totalRuntimeChars = estimateHistoryChars(runtimeMessages)

  const runtimeOverflow =
    runtimeMessages.length > compressedRecentHistory.length &&
    totalRuntimeChars > effectiveMaxHistoryChars
  if (!runtimeOverflow) {
    return {
      history: recentHistory,
      summary: previousSummary,
      compressed: false,
    }
  }

  const previousUpdatedAt = previousSummaryState.updatedAt
    ? Date.parse(previousSummaryState.updatedAt)
    : Number.NaN
  const now = Date.now()
  const withinCooldown =
    Number.isFinite(previousUpdatedAt) &&
    now - previousUpdatedAt < Math.max(0, compressionCooldownMs)
  if (withinCooldown) {
    return {
      history: recentHistory,
      summary: previousSummary,
      compressed: false,
    }
  }

  const summarizedMessages = runtimeMessages
    .slice(0, compressedRecentHistoryState.startIndex)
    .filter(isVisibleConversationMessage)
  const summaryLines = summarizedMessages
    .slice(-Math.max(1, summaryMaxMessages))
    .map((message, index) => summarizeMessage(message, index))
  const summary = withSummaryHeading(
    trimSummary(
      [
        previousSummary,
        [
          `新增收敛 ${summarizedMessages.length} 条消息：`,
          ...summaryLines,
        ].join("\n"),
      ]
        .filter(Boolean)
        .join("\n\n"),
      Math.max(1024, summaryMaxChars),
    ),
  )

  mkdirSync(paths.dir, { recursive: true })
  rewriteLlmHistory(conversationDir, compressedRecentHistory)
  writeFileSync(
    paths.summaryFile,
    JSON.stringify(
      {
        updatedAt: new Date(now).toISOString(),
        conversationId,
        summarizedMessageCount: summarizedMessages.length,
        keptMessageCount: compressedRecentHistory.length,
        summary,
      },
      null,
      2,
    ),
  )

  return {
    history: compressedRecentHistory,
    summary,
    compressed: true,
  }
}
