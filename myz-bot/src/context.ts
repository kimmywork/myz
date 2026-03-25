import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { resolve } from "node:path"
import type { Message } from "@myz/ai-core/types"
import { rewriteLlmHistory } from "./conversations"
import { saveConversationSummary } from "./memory"

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

function isCompressedHistoryMessage(message: Message) {
  if (message.role === "tool") return false
  return isRuntimeHistoryMessage(message)
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
    logFile: resolve(dir, "compression-log.jsonl"),
    archiveDir: resolve(dir, "archive"),
  }
}

function estimateMessageChars(message: Message) {
  const content =
    typeof message.content === "string" ? message.content.length : 0
  const toolCalls = Array.isArray(message.tool_calls)
    ? JSON.stringify(message.tool_calls).length
    : 0
  return content + toolCalls + 64
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
  return capped
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

export function prepareConversationContext(options: {
  conversationDir: string
  conversationId: string
  memoryDir: string
  messages: Message[]
  maxHistoryMessages: number
  compressionThreshold: number
  summaryMaxMessages: number
  summaryMaxChars?: number
  maxHistoryChars?: number
  compressionCooldownMs?: number
}) {
  const {
    conversationDir,
    conversationId,
    memoryDir,
    messages,
    maxHistoryMessages,
    compressionThreshold,
    summaryMaxMessages,
    summaryMaxChars = 6000,
    maxHistoryChars = 120000,
    compressionCooldownMs = 300000,
  } = options

  const runtimeMessages = messages.filter(isRuntimeHistoryMessage)
  const compressedRuntimeMessages = runtimeMessages.filter(isCompressedHistoryMessage)
  const visibleMessages = runtimeMessages.filter(isVisibleConversationMessage)
  const effectiveMaxHistoryMessages = Math.max(1, maxHistoryMessages)
  const effectiveMaxHistoryChars = Math.max(4096, maxHistoryChars)
  const paths = getContextPaths(conversationDir)
  const previousSummaryState = existsSync(paths.summaryFile)
    ? (() => {
        try {
          return JSON.parse(readFileSync(paths.summaryFile, "utf-8")) as {
            summary?: string
            updatedAt?: string
          }
        } catch {
          return {}
        }
      })()
    : {}
  const previousSummary = previousSummaryState.summary || ""
  const recentHistory = takeRecentMessagesWithinBudget(
    runtimeMessages,
    effectiveMaxHistoryMessages,
    effectiveMaxHistoryChars,
  )
  const compressedRecentHistory = takeRecentMessagesWithinBudget(
    compressedRuntimeMessages,
    effectiveMaxHistoryMessages,
    effectiveMaxHistoryChars,
  )
  const threshold = Math.max(
    effectiveMaxHistoryMessages + 1,
    compressionThreshold,
  )

  const runtimeOverflow =
    compressedRuntimeMessages.length > compressedRecentHistory.length &&
    visibleMessages.length >= threshold
  if (!runtimeOverflow) {
    return {
      history: recentHistory,
      summary: previousSummary,
      compressed: false,
    }
  }

  const archivedMessages = runtimeMessages.slice(0, runtimeMessages.length - recentHistory.length)
  const archivedVisibleMessages = archivedMessages.filter(isVisibleConversationMessage)
  mkdirSync(paths.dir, { recursive: true })
  mkdirSync(paths.archiveDir, { recursive: true })
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

  const summaryLines = archivedVisibleMessages
    .slice(-Math.max(1, summaryMaxMessages))
    .map((message, index) => summarizeMessage(message, index))
  const batchSummary = [
    `新增归档 ${archivedVisibleMessages.length} 条消息：`,
    ...summaryLines,
  ].join("\n")
  const summary = withSummaryHeading(
    trimSummary(
      [previousSummary, batchSummary].filter(Boolean).join("\n\n"),
      Math.max(1024, summaryMaxChars),
    ),
  )

  const archivePath = resolve(
    paths.archiveDir,
    `llm-history-${new Date(now).toISOString().replace(/[:.]/g, "-")}.jsonl`,
  )
  const archiveContent =
    archivedMessages.length > 0
      ? `${archivedMessages.map((message) => JSON.stringify(message)).join("\n")}\n`
      : ""
  writeFileSync(archivePath, archiveContent)
  rewriteLlmHistory(conversationDir, compressedRecentHistory)

  if (previousSummary !== summary) {
    writeFileSync(
      paths.summaryFile,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          conversationId,
          archivedMessageCount: archivedVisibleMessages.length,
          keptMessageCount: compressedRecentHistory.length,
          summary,
        },
        null,
        2,
      ),
    )
    appendFileSync(
      paths.logFile,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        conversationId,
        archivedMessageCount: archivedVisibleMessages.length,
        keptMessageCount: compressedRecentHistory.length,
        archivePath,
      }) + "\n",
    )
    saveConversationSummary(memoryDir, conversationId, summary)
  }

  return {
    history: compressedRecentHistory,
    summary,
    compressed: true,
  }
}
