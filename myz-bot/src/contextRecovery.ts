import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { generateReply } from "./ai"
import type { BotRuntimeConfig } from "./config"
import { deriveThinHistoryThreshold } from "./context"
import { createSystemMessage, createUserMessage, getTelegramHistoryPath } from "./conversations"
import { loadLatestConversationSummary, loadMemoryEntries } from "./memory"
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
  contextWindowTokens?: number
  maxOutputTokens?: number
  latestUserInput: string
}) {
  const thinHistoryThreshold = deriveThinHistoryThreshold({
    contextWindowTokens: options.contextWindowTokens,
    maxOutputTokens: options.maxOutputTokens,
  })
  return Boolean(options.latestUserInput.trim()) && options.runtimeHistoryLength <= thinHistoryThreshold
}

function readRecentMemoryCandidates(memoryDir: string, conversationId: string) {
  return loadMemoryEntries(memoryDir)
    .filter((entry) => {
      if (entry.kind !== "memory") return false
      return (
        entry.tags.includes(`conversation:${conversationId}`) ||
        entry.tags.includes("auto-memory")
      )
    })
    .slice(0, 4)
    .map((entry) => {
      const content = normalizeText(entry.content)
      return {
        label: `memory:${entry.title}`,
        content: snippet(content, 500),
      } satisfies RecoveryCandidate
    })
}

function readConversationSummaryCandidate(memoryDir: string, conversationId: string) {
  const summary = loadLatestConversationSummary(memoryDir, conversationId)
  if (!summary) return null
  const content = normalizeText(summary.content)
  if (!content) return null
  return {
    label: "conversation-summary",
    content: snippet(content, 700),
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
  latestUserInput: string
  runtimeHistoryLength: number
  contextWindowTokens?: number
  maxOutputTokens?: number
  force?: boolean
  createCompletion?: (messages: ReturnType<typeof createSystemMessage>[]) => Promise<string>
}) {
  if (!options.force && !shouldAttemptContextRecovery(options)) {
    return { used: false, recoveredContext: "", cached: false }
  }

  const conversationSummary = readConversationSummaryCandidate(
    options.memoryDir,
    options.conversationId,
  )
  const telegramTail = readTelegramTailCandidate(options.conversationDir)
  const candidates = [
    conversationSummary,
    telegramTail,
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
