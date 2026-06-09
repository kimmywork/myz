import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import type { Message } from "@myz/ai-core/types"
import type { BotRuntimeConfig } from "./config"
import { getSessionHistoryPath } from "./sessions"
import { listElevatedPermissionRequests } from "./elevatedPermissions"
import { listSessionTasks } from "./tasks"

const PROCESS_STARTED_AT = Date.now()
const RESTART_EXIT_CODE = 75

let restartScheduled = false
let restartExitHandler: (exitCode: number) => void = (exitCode) => {
  process.exit(exitCode)
}

type MaintenanceScope = "current" | "all"

export interface BotRuntimeStatus {
  pid: number
  uptimeSeconds: number
  schedulerEnabled: boolean
  conversations: number
  pendingPermissionRequests: number
  activeTasks: number
}

export interface TokenUsageTotals {
  totalTokens: number
  promptTokens: number
  completionTokens: number
  reasoningTokens: number
  cachedPromptTokens: number
}

export interface ConversationTokenUsageSummary extends TokenUsageTotals {
  sessionId: string
  assistantMessages: number
  meteredMessages: number
  toolCallCount: number
  resumedReplies: number
  cacheHitReplies: number
}

export interface TokenUsageSummary extends TokenUsageTotals {
  scope: MaintenanceScope
  conversations: number
  assistantMessages: number
  meteredMessages: number
  toolCallCount: number
  resumedReplies: number
  cacheHitReplies: number
  byConversation: ConversationTokenUsageSummary[]
}

function listSessionDirs(sessionsDir: string) {
  if (!existsSync(sessionsDir)) return [] as Array<{ id: string; dir: string }>
  return readdirSync(sessionsDir)
    .map((name) => {
      const dir = resolve(sessionsDir, name)
      try {
        return statSync(dir).isDirectory() ? { id: name, dir } : null
      } catch {
        return null
      }
    })
    .filter((entry): entry is { id: string; dir: string } => Boolean(entry))
}

function loadJsonlMessages(path: string) {
  if (!existsSync(path)) return [] as Message[]
  const raw = readFileSync(path, "utf-8").trim()
  if (!raw) return [] as Message[]
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Message)
}

function normalizeUsageValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function sumUsageTotals(target: TokenUsageTotals, source: Partial<TokenUsageTotals>) {
  target.totalTokens += normalizeUsageValue(source.totalTokens)
  target.promptTokens += normalizeUsageValue(source.promptTokens)
  target.completionTokens += normalizeUsageValue(source.completionTokens)
  target.reasoningTokens += normalizeUsageValue(source.reasoningTokens)
  target.cachedPromptTokens += normalizeUsageValue(source.cachedPromptTokens)
}

function extractUsageTotals(message: Message): TokenUsageTotals {
  const usage = message.metadata?.usage as Record<string, unknown> | undefined
  if (!usage) {
    return {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      cachedPromptTokens: 0,
    }
  }
  const inputDetails =
    usage.input_tokens_details &&
    typeof usage.input_tokens_details === "object" &&
    usage.input_tokens_details !== null
      ? (usage.input_tokens_details as Record<string, unknown>)
      : undefined
  const outputDetails =
    usage.output_tokens_details &&
    typeof usage.output_tokens_details === "object" &&
    usage.output_tokens_details !== null
      ? (usage.output_tokens_details as Record<string, unknown>)
      : undefined
  return {
    totalTokens: normalizeUsageValue(usage.total_tokens ?? usage.totalTokens),
    promptTokens: normalizeUsageValue(
      usage.prompt_tokens ??
        usage.promptTokens ??
        usage.input_tokens ??
        usage.inputTokens,
    ),
    completionTokens: normalizeUsageValue(
      usage.completion_tokens ??
        usage.completionTokens ??
        usage.output_tokens ??
        usage.outputTokens,
    ),
    reasoningTokens: normalizeUsageValue(
      usage.reasoning_tokens ??
        usage.reasoningTokens ??
        outputDetails?.reasoning_tokens ??
        outputDetails?.reasoningTokens,
    ),
    cachedPromptTokens: normalizeUsageValue(
      usage.cached_prompt_tokens ??
        usage.cachedPromptTokens ??
        inputDetails?.cached_tokens ??
        inputDetails?.cachedTokens,
    ),
  }
}

function readSessionUsageSummary(sessionDir: string, sessionId: string) {
  const messages = loadJsonlMessages(getSessionHistoryPath(sessionDir))

  const totals: ConversationTokenUsageSummary = {
    sessionId,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    cachedPromptTokens: 0,
    assistantMessages: 0,
    meteredMessages: 0,
    toolCallCount: 0,
    resumedReplies: 0,
    cacheHitReplies: 0,
  }

  messages.forEach((message) => {
    if (message.role !== "assistant") return
    totals.assistantMessages += 1
    const usage = extractUsageTotals(message)
    if (
      usage.totalTokens ||
      usage.promptTokens ||
      usage.completionTokens ||
      usage.reasoningTokens
    ) {
      totals.meteredMessages += 1
    }
    totals.toolCallCount +=
      typeof message.metadata?.toolCallCount === "number"
        ? message.metadata.toolCallCount
        : 0
    totals.resumedReplies +=
      typeof message.metadata?.providerPreviousResponseId === "string" &&
      message.metadata.providerPreviousResponseId.trim()
        ? 1
        : 0
    totals.cacheHitReplies += usage.cachedPromptTokens > 0 ? 1 : 0
    sumUsageTotals(totals, usage)
  })

  return totals
}

export function getBotRuntimeStatus(config: BotRuntimeConfig): BotRuntimeStatus {
  const conversationEntries = listSessionDirs(config.sessionsDir)
  const activeTasks = conversationEntries.reduce((count, entry) => {
    const tasks = listSessionTasks({
      sessionDir: entry.dir,
      sessionId: entry.id,
      includeDeleted: false,
    })
    return count + tasks.filter((task) => task.status === "pending" || task.status === "running").length
  }, 0)

  return {
    pid: process.pid,
    uptimeSeconds: Math.max(0, Math.floor((Date.now() - PROCESS_STARTED_AT) / 1000)),
    schedulerEnabled: config.scheduler.enabled !== false,
    conversations: conversationEntries.length,
    pendingPermissionRequests: listElevatedPermissionRequests(
      config.workspaceRuntimeRoot,
      "pending",
    ).length,
    activeTasks,
  }
}

export function formatBotRuntimeStatus(status: BotRuntimeStatus) {
  return [
    "运行状态：",
    `- pid: ${status.pid}`,
    `- uptimeSeconds: ${status.uptimeSeconds}`,
    `- schedulerEnabled: ${status.schedulerEnabled ? "true" : "false"}`,
    `- conversations: ${status.conversations}`,
    `- pendingPermissionRequests: ${status.pendingPermissionRequests}`,
    `- activeTasks: ${status.activeTasks}`,
  ].join("\n")
}

export function collectTokenUsageSummary(options: {
  config: BotRuntimeConfig
  scope: MaintenanceScope
  sessionId?: string
}) {
  const entries =
    options.scope === "current"
      ? options.sessionId
        ? [
            {
              id: options.sessionId,
              dir: resolve(options.config.sessionsDir, options.sessionId),
            },
          ]
        : []
      : listSessionDirs(options.config.sessionsDir)

  const byConversation = entries
    .filter((entry) => existsSync(entry.dir))
    .map((entry) => readSessionUsageSummary(entry.dir, entry.id))
    .filter((entry) => entry.assistantMessages > 0 || entry.totalTokens > 0)
    .sort((left, right) => right.totalTokens - left.totalTokens)

  const summary: TokenUsageSummary = {
    scope: options.scope,
    conversations: byConversation.length,
    assistantMessages: 0,
    meteredMessages: 0,
    toolCallCount: 0,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    cachedPromptTokens: 0,
    resumedReplies: 0,
    cacheHitReplies: 0,
    byConversation,
  }

  byConversation.forEach((entry) => {
    summary.assistantMessages += entry.assistantMessages
    summary.meteredMessages += entry.meteredMessages
    summary.toolCallCount += entry.toolCallCount
    summary.resumedReplies += entry.resumedReplies
    summary.cacheHitReplies += entry.cacheHitReplies
    sumUsageTotals(summary, entry)
  })

  return summary
}

export function formatTokenUsageSummary(summary: TokenUsageSummary, maxConversations = 8) {
  const lines = [
    `Token 用量统计（${summary.scope}）：`,
    `- conversations: ${summary.conversations}`,
    `- assistantMessages: ${summary.assistantMessages}`,
    `- meteredMessages: ${summary.meteredMessages}`,
    `- toolCallCount: ${summary.toolCallCount}`,
    `- resumedReplies: ${summary.resumedReplies}`,
    `- cacheHitReplies: ${summary.cacheHitReplies}`,
    `- totalTokens: ${summary.totalTokens}`,
    `- promptTokens: ${summary.promptTokens}`,
    `- cachedPromptTokens: ${summary.cachedPromptTokens}`,
    `- completionTokens: ${summary.completionTokens}`,
    `- reasoningTokens: ${summary.reasoningTokens}`,
  ]

  if (summary.byConversation.length) {
    lines.push("", "按会话统计：")
    summary.byConversation.slice(0, Math.max(1, maxConversations)).forEach((entry) => {
      lines.push(
        `- ${entry.sessionId} | total=${entry.totalTokens} | prompt=${entry.promptTokens} | cached=${entry.cachedPromptTokens} | replies=${entry.assistantMessages} | resumed=${entry.resumedReplies} | cacheHits=${entry.cacheHitReplies} | tools=${entry.toolCallCount}`,
      )
    })
  }

  return lines.join("\n")
}
export function requestProcessRestart(options: {
  delayMs?: number
  exitCode?: number
  requestFilePath?: string
  reason?: string
  requestedBy?: string
  targetVersion?: string
  packageName?: string
  scheduleExit?: boolean
} = {}) {
  if (restartScheduled) {
    return false
  }
  restartScheduled = true
  if (options.requestFilePath) {
    mkdirSync(dirname(options.requestFilePath), { recursive: true })
    writeFileSync(
      options.requestFilePath,
      JSON.stringify(
        {
          schemaVersion: "1.0.0",
          requestedAt: new Date().toISOString(),
          reason: options.reason || "manual_restart",
          requestedBy: options.requestedBy || "system",
          exitCode: options.exitCode ?? RESTART_EXIT_CODE,
          targetVersion: options.targetVersion || null,
          packageName: options.packageName || null,
        },
        null,
        2,
      ),
    )
  }
  if (options.scheduleExit === false) {
    return true
  }
  const timer = setTimeout(() => {
    restartExitHandler(options.exitCode ?? RESTART_EXIT_CODE)
  }, Math.max(0, options.delayMs ?? 200))
  timer.unref?.()
  return true
}

export function __setRestartExitHandlerForTest(
  handler: ((exitCode: number) => void) | null,
) {
  restartExitHandler = handler || ((exitCode) => process.exit(exitCode))
}

export function __resetRestartStateForTest() {
  restartScheduled = false
}
