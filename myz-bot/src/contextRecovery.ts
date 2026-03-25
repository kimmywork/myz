import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { generateReply } from "./ai"
import { loadChatChronicle } from "./chatChronicle"
import type { BotRuntimeConfig } from "./config"
import { createSystemMessage, createUserMessage, getTelegramHistoryPath } from "./conversations"
import { loadSoulGrowthState, renderSoulGrowthContext } from "./growth"
import { loadMemoryIndex } from "./memory"
import {
  loadRelationshipRecords,
  renderRelationshipContext,
} from "./relationships"
import { loadSoul } from "./soul"
import { loadTelegramHistory } from "./telegramHistory"

interface RecoveryCacheState {
  schemaVersion: string
  fingerprint?: string
  recoveredContext?: string
  updatedAt?: string
  latestTelegramMessageId?: number
}

interface RecoveryCandidate {
  label: string
  content: string
}

const SCHEMA_VERSION = "1.0.0"
const RECOVERY_MAX_CHARS = 2400

function getRecoveryPaths(conversationDir: string) {
  const contextDir = resolve(conversationDir, "context")
  return {
    contextDir,
    cacheFile: resolve(contextDir, "recovered-context.json"),
  }
}

function ensureRecoveryRuntime(conversationDir: string) {
  const paths = getRecoveryPaths(conversationDir)
  mkdirSync(paths.contextDir, { recursive: true })
  if (!existsSync(paths.cacheFile)) {
    writeFileSync(
      paths.cacheFile,
      JSON.stringify(
        {
          schemaVersion: SCHEMA_VERSION,
        } satisfies RecoveryCacheState,
        null,
        2,
      ),
    )
  }
  return paths
}

function loadRecoveryCache(conversationDir: string) {
  const paths = ensureRecoveryRuntime(conversationDir)
  try {
    return JSON.parse(readFileSync(paths.cacheFile, "utf-8")) as RecoveryCacheState
  } catch {
    return { schemaVersion: SCHEMA_VERSION } satisfies RecoveryCacheState
  }
}

function saveRecoveryCache(conversationDir: string, state: RecoveryCacheState) {
  const paths = ensureRecoveryRuntime(conversationDir)
  writeFileSync(paths.cacheFile, JSON.stringify(state, null, 2))
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
}

function snippet(value: string, maxChars = 400) {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars - 3)}...`
}

function buildFingerprint(parts: string[]) {
  return createHash("sha1")
    .update(parts.filter(Boolean).join("\n\n"))
    .digest("hex")
}

function shouldAttemptContextRecovery(options: {
  runtimeHistoryLength: number
  maxHistoryMessages: number
  latestUserInput: string
}) {
  const thinHistoryThreshold = Math.max(8, Math.floor(options.maxHistoryMessages / 4))
  return Boolean(options.latestUserInput.trim()) && options.runtimeHistoryLength <= thinHistoryThreshold
}

function readRecentMemoryCandidates(memoryDir: string, conversationId: string) {
  return loadMemoryIndex(memoryDir)
    .filter((item) => {
      if (!item || !existsSync(item.file)) return false
      return item.tags.includes(`conversation:${conversationId}`) || item.tags.includes("auto-memory")
    })
    .slice(0, 4)
    .map((item) => {
      const content = normalizeText(readFileSync(item.file, "utf-8"))
      return {
        label: `memory:${item.title}`,
        content: snippet(content, 500),
      } satisfies RecoveryCandidate
    })
}

function readArchiveTailCandidates(archiveDir: string, labelPrefix: string) {
  if (!existsSync(archiveDir)) return [] as RecoveryCandidate[]
  return readdirSync(archiveDir)
    .filter((name) => name.endsWith(".jsonl") || name.endsWith(".md"))
    .sort()
    .reverse()
    .slice(0, 2)
    .map((name) => {
      const path = resolve(archiveDir, name)
      const content = normalizeText(readFileSync(path, "utf-8"))
      const tail = content
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-3)
        .join("\n")
      return {
        label: `${labelPrefix}:${name}`,
        content: snippet(tail, 500),
      } satisfies RecoveryCandidate
    })
    .filter((candidate) => candidate.content)
}

function readRelationshipCandidate(options: {
  workspaceRoot: string
  actorUserId?: number
  username?: string
}) {
  const rendered = renderRelationshipContext(options)
  if (!rendered) return null
  return {
    label: "relationship.current",
    content: rendered,
  } satisfies RecoveryCandidate
}

function readRelationshipArchiveCandidates(workspaceRoot: string) {
  return readArchiveTailCandidates(
    resolve(workspaceRoot, "relationships", "archive"),
    "relationship.archive",
  )
}

function readGrowthCandidates(workspaceRoot: string) {
  const soul = loadSoul(workspaceRoot)
  const state = loadSoulGrowthState(workspaceRoot)
  const rendered = renderSoulGrowthContext(workspaceRoot, soul)
  const recentEvents = state.recentEvents
    .slice(0, 4)
    .map((event) => {
      const adjustmentText = event.adjustments
        .map((adjustment) => `${adjustment.trait}${adjustment.delta > 0 ? "+" : ""}${adjustment.delta.toFixed(1)}`)
        .join(", ")
      return `- ${event.userExcerpt} -> ${adjustmentText}`
    })
    .join("\n")
  return [
    {
      label: "growth.current",
      content: [rendered, recentEvents].filter(Boolean).join("\n"),
    } satisfies RecoveryCandidate,
    ...readArchiveTailCandidates(
      resolve(workspaceRoot, "soul", "archive"),
      "growth.archive",
    ),
  ].filter((candidate) => candidate.content)
}

function readRelationshipStateCandidates(workspaceRoot: string) {
  const records = loadRelationshipRecords(workspaceRoot)
    .slice(0, 6)
    .map((record) =>
      [
        record.displayNames[0] || record.usernames[0] || record.key,
        record.relationshipSummary,
        record.impressionSummary,
        `policy=${record.messagingPolicy}`,
      ]
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n")
  if (!records) return [] as RecoveryCandidate[]
  return [
    {
      label: "relationship.index",
      content: records,
    } satisfies RecoveryCandidate,
    ...readRelationshipArchiveCandidates(workspaceRoot),
  ]
}

function readConversationSummaryCandidate(memoryDir: string, conversationId: string) {
  const path = resolve(memoryDir, "conversation-summaries", `${conversationId}.md`)
  if (!existsSync(path)) return null
  const content = normalizeText(readFileSync(path, "utf-8"))
  if (!content) return null
  return {
    label: "conversation-summary",
    content: snippet(content, 700),
  } satisfies RecoveryCandidate
}

function readChronicleCandidate(conversationDir: string) {
  const chronicle = loadChatChronicle(conversationDir)
  if (!chronicle) return null
  return {
    label: "chat-chronicle",
    content: snippet(chronicle, 1200),
  } satisfies RecoveryCandidate
}

function readTelegramTailCandidate(conversationDir: string) {
  const entries = loadTelegramHistory(conversationDir)
    .filter((entry) => entry.kind !== "progress")
  if (!entries.length) return null
  const tail = entries
    .slice(-8)
    .map((entry) => `${entry.speaker}: ${snippet(entry.text, 120)}`)
    .join("\n")
  return {
    label: "telegram.tail",
    content: tail,
  } satisfies RecoveryCandidate
}

function buildRecoveryPrompt(options: {
  conversationId: string
  latestUserInput: string
  candidates: RecoveryCandidate[]
}) {
  return [
    createSystemMessage(
      options.conversationId,
      [
        "你是长期上下文恢复器。",
        "任务：在运行时对话历史不够厚的时候，根据当前用户输入，从多个长期状态层和归档材料中挑出真正相关的背景，并整理成一份可直接注入系统提示的恢复上下文。",
        "",
        "规则：",
        "- 相关性判断尽量交给你自己完成，不要机械复述全部候选材料。",
        "- 优先保留：持续主题、稳定偏好、未完成约定、关系边界、人格成长变化、与当前请求直接相关的历史背景。",
        "- 排除：工具细节、实现细节、路径、无关寒暄、重复表述。",
        `- 输出长度控制在 ${RECOVERY_MAX_CHARS} 字符以内。`,
        "- 如果这些候选材料对当前输入都不重要，只输出 NONE。",
        "- 只输出 Markdown，不要输出解释。",
        "",
        "输出结构：",
        "## 恢复上下文",
        "- ...",
        "## 当前相关长期线索",
        "- ...",
      ].join("\n"),
    ),
    createUserMessage(
      options.conversationId,
      [
        `当前输入：${options.latestUserInput.trim()}`,
        "",
        "候选长期材料：",
        ...options.candidates.map((candidate) =>
          [`[${candidate.label}]`, candidate.content].filter(Boolean).join("\n"),
        ),
      ].join("\n\n"),
    ),
  ]
}

function normalizeRecoveredContext(content: string) {
  const normalized = normalizeText(content)
  if (!normalized || /^none$/i.test(normalized)) return ""
  if (normalized.length <= RECOVERY_MAX_CHARS) return normalized
  return `${normalized.slice(0, RECOVERY_MAX_CHARS - 10).trim()}\n[已收敛]`
}

export async function recoverContextIfNeeded(options: {
  config: BotRuntimeConfig
  conversationId: string
  conversationDir: string
  memoryDir: string
  workspaceRoot: string
  actorUserId?: number
  username?: string
  latestUserInput: string
  runtimeHistoryLength: number
  maxHistoryMessages: number
  createCompletion?: (messages: ReturnType<typeof createSystemMessage>[]) => Promise<string>
}) {
  if (!shouldAttemptContextRecovery(options)) {
    return { used: false, recoveredContext: "", cached: false }
  }

  const chronicle = readChronicleCandidate(options.conversationDir)
  const conversationSummary = readConversationSummaryCandidate(
    options.memoryDir,
    options.conversationId,
  )
  const relationship = readRelationshipCandidate({
    workspaceRoot: options.workspaceRoot,
    actorUserId: options.actorUserId,
    username: options.username,
  })
  const telegramTail = readTelegramTailCandidate(options.conversationDir)
  const candidates = [
    chronicle,
    conversationSummary,
    relationship,
    telegramTail,
    ...readGrowthCandidates(options.workspaceRoot),
    ...readRelationshipStateCandidates(options.workspaceRoot),
    ...readRecentMemoryCandidates(options.memoryDir, options.conversationId),
  ].filter((candidate): candidate is RecoveryCandidate => Boolean(candidate?.content))

  if (!candidates.length) {
    return { used: false, recoveredContext: "", cached: false }
  }

  const latestTelegramMessageId =
    loadTelegramHistory(options.conversationDir).slice(-1)[0]?.telegramMessageId
  const fingerprint = buildFingerprint([
    options.latestUserInput,
    String(latestTelegramMessageId || ""),
    ...candidates.map((candidate) => `${candidate.label}:${candidate.content}`),
  ])
  const cache = loadRecoveryCache(options.conversationDir)
  if (cache.fingerprint === fingerprint) {
    return {
      used: Boolean(cache.recoveredContext),
      recoveredContext: cache.recoveredContext || "",
      cached: true,
    }
  }

  const prompt = buildRecoveryPrompt({
    conversationId: options.conversationId,
    latestUserInput: options.latestUserInput,
    candidates,
  })
  const analysisConfig: BotRuntimeConfig = {
    ...options.config,
    ai: {
      ...options.config.ai,
      capabilities: {
        ...options.config.ai.capabilities,
        toolCalling: false,
        reasoning: false,
      },
      limits: {
        ...options.config.ai.limits,
        maxOutputTokens: Math.min(options.config.ai.limits.maxOutputTokens, 900),
      },
    },
  }

  let completion = ""
  try {
    completion = options.createCompletion
      ? await options.createCompletion(prompt)
      : (await generateReply({
          config: analysisConfig,
          messages: prompt,
          conversationId: options.conversationId,
        })).content
  } catch {
    return {
      used: Boolean(cache.recoveredContext),
      recoveredContext: cache.recoveredContext || "",
      cached: Boolean(cache.recoveredContext),
    }
  }

  const recoveredContext = normalizeRecoveredContext(completion)
  saveRecoveryCache(options.conversationDir, {
    schemaVersion: SCHEMA_VERSION,
    fingerprint,
    recoveredContext,
    updatedAt: new Date().toISOString(),
    latestTelegramMessageId,
  })
  return {
    used: Boolean(recoveredContext),
    recoveredContext,
    cached: false,
  }
}

export function loadRecoveredContext(conversationDir: string) {
  const cache = loadRecoveryCache(conversationDir)
  return cache.recoveredContext || ""
}

export function getConversationLatestTelegramMessageId(conversationDir: string) {
  const path = getTelegramHistoryPath(conversationDir)
  if (!existsSync(path)) return undefined
  const entries = loadTelegramHistory(conversationDir)
  return entries[entries.length - 1]?.telegramMessageId
}
