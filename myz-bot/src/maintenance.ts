import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import { dirname, resolve } from "node:path"
import type { Message } from "@myz/ai-core/types"
import type { BotRuntimeConfig } from "./config"
import {
  getLegacyHistoryPath,
  getLlmHistoryPath,
  getLlmTracePath,
} from "./conversations"
import { listElevatedPermissionRequests } from "./elevatedPermissions"
import {
  ensureMemoryDir,
  loadMemoryIndex,
  removeMemoryEntries,
  resetLongTermMemory,
} from "./memory"
import { listConversationTasks } from "./tasks"

const PROCESS_STARTED_AT = Date.now()
const RECOVERED_CONTEXT_SCHEMA_VERSION = "1.0.0"
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
  memoryItems: number
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
  conversationId: string
  assistantMessages: number
  meteredMessages: number
  toolCallCount: number
}

export interface TokenUsageSummary extends TokenUsageTotals {
  scope: MaintenanceScope
  conversations: number
  assistantMessages: number
  meteredMessages: number
  toolCallCount: number
  byConversation: ConversationTokenUsageSummary[]
}

export interface MemoryResetResult {
  scope: MaintenanceScope
  removedItems: number
  removedNotes: number
  removedSummaries: number
  clearedLongTermMemory: boolean
}

export interface HousekeepingResult {
  scope: MaintenanceScope
  conversations: number
  archivedHistoryFiles: number
  archivedTraceFiles: number
  clearedHistoryFiles: number
  clearedTraceFiles: number
  resetRecoveredContexts: number
}

function listConversationDirs(conversationsDir: string) {
  if (!existsSync(conversationsDir)) return [] as Array<{ id: string; dir: string }>
  return readdirSync(conversationsDir)
    .map((name) => {
      const dir = resolve(conversationsDir, name)
      try {
        return statSync(dir).isDirectory() ? { id: name, dir } : null
      } catch {
        return null
      }
    })
    .filter((entry): entry is { id: string; dir: string } => Boolean(entry))
}

function resolveReadableLlmHistoryPath(conversationDir: string) {
  const llmPath = getLlmHistoryPath(conversationDir)
  if (existsSync(llmPath)) return llmPath
  const legacyPath = getLegacyHistoryPath(conversationDir)
  return existsSync(legacyPath) ? legacyPath : llmPath
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

function readConversationUsageSummary(conversationDir: string, conversationId: string) {
  const contextArchiveDir = resolve(conversationDir, "context", "archive")
  const archiveMessages = existsSync(contextArchiveDir)
    ? readdirSync(contextArchiveDir)
        .filter((name) => name.endsWith(".jsonl") && /llm-history/i.test(name))
        .sort()
        .flatMap((name) => loadJsonlMessages(resolve(contextArchiveDir, name)))
    : []
  const messages = [
    ...archiveMessages,
    ...loadJsonlMessages(resolveReadableLlmHistoryPath(conversationDir)),
  ]

  const totals: ConversationTokenUsageSummary = {
    conversationId,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    cachedPromptTokens: 0,
    assistantMessages: 0,
    meteredMessages: 0,
    toolCallCount: 0,
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
    sumUsageTotals(totals, usage)
  })

  return totals
}

function deleteFileIfExists(path: string) {
  if (!existsSync(path)) return false
  unlinkSync(path)
  return true
}

function resetRecoveredContext(conversationDir: string) {
  const contextDir = resolve(conversationDir, "context")
  const recoveredContextPath = resolve(contextDir, "recovered-context.json")
  mkdirSync(contextDir, { recursive: true })
  writeFileSync(
    recoveredContextPath,
    JSON.stringify(
      {
        schemaVersion: RECOVERED_CONTEXT_SCHEMA_VERSION,
      },
      null,
      2,
    ),
  )
}

function archiveAndClearFile(options: {
  sourcePath: string
  archivePath: string
}) {
  if (!existsSync(options.sourcePath)) return false
  const raw = readFileSync(options.sourcePath, "utf-8")
  if (!raw.trim()) {
    writeFileSync(options.sourcePath, "")
    return false
  }
  writeFileSync(options.archivePath, raw)
  writeFileSync(options.sourcePath, "")
  return true
}

export function getBotRuntimeStatus(config: BotRuntimeConfig): BotRuntimeStatus {
  const conversationEntries = listConversationDirs(config.conversationsDir)
  const activeTasks = conversationEntries.reduce((count, entry) => {
    const tasks = listConversationTasks({
      conversationDir: entry.dir,
      conversationId: entry.id,
      includeDeleted: false,
    })
    return count + tasks.filter((task) => task.status === "pending" || task.status === "running").length
  }, 0)

  return {
    pid: process.pid,
    uptimeSeconds: Math.max(0, Math.floor((Date.now() - PROCESS_STARTED_AT) / 1000)),
    schedulerEnabled: config.scheduler.enabled !== false,
    conversations: conversationEntries.length,
    memoryItems: loadMemoryIndex(config.memoryDir).length,
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
    `- memoryItems: ${status.memoryItems}`,
    `- pendingPermissionRequests: ${status.pendingPermissionRequests}`,
    `- activeTasks: ${status.activeTasks}`,
  ].join("\n")
}

export function collectTokenUsageSummary(options: {
  config: BotRuntimeConfig
  scope: MaintenanceScope
  conversationId?: string
}) {
  const entries =
    options.scope === "current"
      ? options.conversationId
        ? [
            {
              id: options.conversationId,
              dir: resolve(options.config.conversationsDir, options.conversationId),
            },
          ]
        : []
      : listConversationDirs(options.config.conversationsDir)

  const byConversation = entries
    .filter((entry) => existsSync(entry.dir))
    .map((entry) => readConversationUsageSummary(entry.dir, entry.id))
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
    byConversation,
  }

  byConversation.forEach((entry) => {
    summary.assistantMessages += entry.assistantMessages
    summary.meteredMessages += entry.meteredMessages
    summary.toolCallCount += entry.toolCallCount
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
        `- ${entry.conversationId} | total=${entry.totalTokens} | prompt=${entry.promptTokens} | cached=${entry.cachedPromptTokens} | completion=${entry.completionTokens} | replies=${entry.assistantMessages} | tools=${entry.toolCallCount}`,
      )
    })
  }

  return lines.join("\n")
}

export function resetConversationMemory(options: {
  memoryDir: string
  conversationId: string
  includeLongTerm?: boolean
}) {
  ensureMemoryDir(options.memoryDir)
  const removed = removeMemoryEntries(
    options.memoryDir,
    (entry) => entry.tags.includes(`conversation:${options.conversationId}`),
  )
  const removedNotes = removed.filter((entry) => entry.kind === "memory").length
  const removedSummaries = removed.filter((entry) => entry.kind === "summary").length
  if (options.includeLongTerm) {
    throw new Error("current scope 不允许清空全局长期记忆，请改用 /ops reset-memory all full")
  }

  return {
    scope: "current",
    removedItems: removedNotes,
    removedNotes,
    removedSummaries,
    clearedLongTermMemory: false,
  } satisfies MemoryResetResult
}

export function resetAllMemory(options: {
  memoryDir: string
  includeLongTerm?: boolean
}) {
  ensureMemoryDir(options.memoryDir)
  const removed = removeMemoryEntries(options.memoryDir, () => true)
  const removedNotes = removed.filter((entry) => entry.kind === "memory").length
  const removedSummaries = removed.filter((entry) => entry.kind === "summary").length
  const clearedLongTermMemory = Boolean(options.includeLongTerm)
  if (clearedLongTermMemory) {
    resetLongTermMemory(options.memoryDir)
  }

  return {
    scope: "all",
    removedItems: removedNotes,
    removedNotes,
    removedSummaries,
    clearedLongTermMemory,
  } satisfies MemoryResetResult
}

export function formatMemoryResetResult(result: MemoryResetResult) {
  return [
    `记忆已重置（${result.scope}）：`,
    `- removedItems: ${result.removedItems}`,
    `- removedNotes: ${result.removedNotes}`,
    `- removedSummaries: ${result.removedSummaries}`,
    `- clearedLongTermMemory: ${result.clearedLongTermMemory ? "true" : "false"}`,
  ].join("\n")
}

export function runConversationHousekeeping(conversationDir: string) {
  const contextArchiveDir = resolve(conversationDir, "context", "archive")
  mkdirSync(contextArchiveDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")

  const historyPath = resolveReadableLlmHistoryPath(conversationDir)
  const tracePath = getLlmTracePath(conversationDir)
  const archivedHistory = archiveAndClearFile({
    sourcePath: historyPath,
    archivePath: resolve(contextArchiveDir, `ops-llm-history-${timestamp}.jsonl`),
  })
  const archivedTrace = archiveAndClearFile({
    sourcePath: tracePath,
    archivePath: resolve(contextArchiveDir, `ops-llm-trace-${timestamp}.jsonl`),
  })
  resetRecoveredContext(conversationDir)

  return {
    archivedHistoryFiles: archivedHistory ? 1 : 0,
    archivedTraceFiles: archivedTrace ? 1 : 0,
    clearedHistoryFiles: existsSync(historyPath) ? 1 : 0,
    clearedTraceFiles: existsSync(tracePath) ? 1 : 0,
    resetRecoveredContexts: 1,
  }
}

export function runHousekeeping(options: {
  conversationsDir: string
  scope: MaintenanceScope
  conversationId?: string
}) {
  const entries =
    options.scope === "current"
      ? options.conversationId
        ? [
            {
              id: options.conversationId,
              dir: resolve(options.conversationsDir, options.conversationId),
            },
          ]
        : []
      : listConversationDirs(options.conversationsDir)

  const result: HousekeepingResult = {
    scope: options.scope,
    conversations: 0,
    archivedHistoryFiles: 0,
    archivedTraceFiles: 0,
    clearedHistoryFiles: 0,
    clearedTraceFiles: 0,
    resetRecoveredContexts: 0,
  }

  entries.forEach((entry) => {
    if (!existsSync(entry.dir)) return
    result.conversations += 1
    const current = runConversationHousekeeping(entry.dir)
    result.archivedHistoryFiles += current.archivedHistoryFiles
    result.archivedTraceFiles += current.archivedTraceFiles
    result.clearedHistoryFiles += current.clearedHistoryFiles
    result.clearedTraceFiles += current.clearedTraceFiles
    result.resetRecoveredContexts += current.resetRecoveredContexts
  })

  return result
}

export function formatHousekeepingResult(result: HousekeepingResult) {
  return [
    `housekeeping 完成（${result.scope}）：`,
    `- conversations: ${result.conversations}`,
    `- archivedHistoryFiles: ${result.archivedHistoryFiles}`,
    `- archivedTraceFiles: ${result.archivedTraceFiles}`,
    `- clearedHistoryFiles: ${result.clearedHistoryFiles}`,
    `- clearedTraceFiles: ${result.clearedTraceFiles}`,
    `- resetRecoveredContexts: ${result.resetRecoveredContexts}`,
  ].join("\n")
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
