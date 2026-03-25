import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { Message } from "@myz/ai-core/types"
import { generateReply } from "./ai"
import type { BotRuntimeConfig } from "./config"
import { createSystemMessage, createUserMessage } from "./conversations"
import { type TelegramHistoryEntry, loadTelegramHistory } from "./telegramHistory"

interface ChatChronicleState {
  schemaVersion: string
  lastProcessedTelegramMessageId?: number
  updatedAt?: string
}

const SCHEMA_VERSION = "1.0.0"
const CHRONICLE_MAX_CHARS = 6000
const CHRONICLE_BATCH_MESSAGE_LIMIT = 24

function getChroniclePaths(conversationDir: string) {
  const contextDir = resolve(conversationDir, "context")
  return {
    contextDir,
    chronicleFile: resolve(contextDir, "chat-chronicle.md"),
    stateFile: resolve(contextDir, "chat-chronicle.json"),
  }
}

function ensureChronicleRuntime(conversationDir: string) {
  const paths = getChroniclePaths(conversationDir)
  mkdirSync(paths.contextDir, { recursive: true })
  if (!existsSync(paths.stateFile)) {
    writeFileSync(
      paths.stateFile,
      JSON.stringify(
        {
          schemaVersion: SCHEMA_VERSION,
        } satisfies ChatChronicleState,
        null,
        2,
      ),
    )
  }
  return paths
}

function loadChronicleState(conversationDir: string): ChatChronicleState {
  const paths = ensureChronicleRuntime(conversationDir)
  try {
    const parsed = JSON.parse(readFileSync(paths.stateFile, "utf-8")) as ChatChronicleState
    return {
      schemaVersion: parsed.schemaVersion || SCHEMA_VERSION,
      lastProcessedTelegramMessageId:
        typeof parsed.lastProcessedTelegramMessageId === "number"
          ? parsed.lastProcessedTelegramMessageId
          : undefined,
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt.trim()
          ? parsed.updatedAt
          : undefined,
    }
  } catch {
    return { schemaVersion: SCHEMA_VERSION }
  }
}

function saveChronicleState(conversationDir: string, state: ChatChronicleState) {
  const paths = ensureChronicleRuntime(conversationDir)
  writeFileSync(paths.stateFile, JSON.stringify(state, null, 2))
}

export function loadChatChronicle(conversationDir: string) {
  const paths = ensureChronicleRuntime(conversationDir)
  if (!existsSync(paths.chronicleFile)) return ""
  return readFileSync(paths.chronicleFile, "utf-8").trim()
}

function normalizeMarkdown(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
}

function trimChronicle(value: string) {
  const normalized = normalizeMarkdown(value)
  if (!normalized) return ""
  if (normalized.length <= CHRONICLE_MAX_CHARS) return normalized
  return `${normalized.slice(0, CHRONICLE_MAX_CHARS - 24).trim()}\n\n[编年摘要已收敛]`
}

function ensureChronicleHeading(value: string) {
  const normalized = trimChronicle(value)
  if (!normalized) return ""
  if (normalized.startsWith("# Chat Chronicle")) return normalized
  return `# Chat Chronicle\n\n${normalized}`
}

function snippet(value: string, maxChars = 180) {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars - 3)}...`
}

function buildTranscript(entries: TelegramHistoryEntry[]) {
  return entries
    .slice(-CHRONICLE_BATCH_MESSAGE_LIMIT)
    .map((entry) => {
      const speaker = entry.speaker === "assistant" ? "bot" : "user"
      return `- ${entry.timestamp} | ${speaker}: ${snippet(entry.text)}`
    })
    .join("\n")
}

function buildChroniclePrompt(options: {
  conversationId: string
  previousChronicle: string
  entries: TelegramHistoryEntry[]
}) {
  const transcript = buildTranscript(options.entries)
  return [
    createSystemMessage(
      options.conversationId,
      [
        "你是对话长期编年摘要编辑器。",
        "任务：基于既有聊天编年摘要和一批新的 Telegram 对话记录，产出一份更新后的 Markdown 编年摘要。",
        "",
        "要求：",
        "- 只保留长期有价值的信息：持续话题、稳定偏好、重要约定、任务推进、关系变化、近期状态。",
        "- 忽略寒暄、重复客套、工具/系统实现细节、路径、命令输出。",
        `- 总长度必须控制在 ${CHRONICLE_MAX_CHARS} 字符以内。`,
        "- 如果旧内容太多，必须主动压缩更早阶段，只保留后续仍有价值的脉络。",
        "- 不要编造未出现的事实。",
        "- 只输出 Markdown，不要输出解释。",
        "",
        "输出结构：",
        "# Chat Chronicle",
        "## 长期脉络",
        "- ...",
        "## 近期阶段",
        "- ...",
      ].join("\n"),
    ),
    createUserMessage(
      options.conversationId,
      [
        "已有聊天编年摘要：",
        options.previousChronicle || "(none)",
        "",
        "本轮新增 Telegram 对话：",
        transcript || "(none)",
      ].join("\n"),
    ),
  ]
}

function fallbackChronicle(options: {
  previousChronicle: string
  entries: TelegramHistoryEntry[]
}) {
  const recentBullets = options.entries
    .slice(-8)
    .map((entry) => `- ${entry.speaker === "assistant" ? "bot" : "user"}：${snippet(entry.text, 120)}`)
  const sections = [
    "# Chat Chronicle",
    "",
    "## 长期脉络",
    options.previousChronicle
      ? "- 已有更早阶段摘要，以下内容在其基础上滚动更新。"
      : "- 暂无更早阶段摘要。",
    "",
    "## 近期阶段",
    ...(recentBullets.length ? recentBullets : ["- 暂无新增互动。"]),
  ]
  return ensureChronicleHeading(sections.join("\n"))
}

export async function updateChatChronicle(options: {
  config: BotRuntimeConfig
  conversationId: string
  conversationDir: string
  now?: Date
  createCompletion?: (messages: ReturnType<typeof createSystemMessage>[]) => Promise<string>
}) {
  const state = loadChronicleState(options.conversationDir)
  const entries = loadTelegramHistory(options.conversationDir)
    .filter((entry) => entry.kind !== "progress")
  const pendingEntries = entries.filter((entry) =>
    typeof state.lastProcessedTelegramMessageId === "number"
      ? entry.telegramMessageId > state.lastProcessedTelegramMessageId
      : true,
  )
  if (!pendingEntries.length) {
    return {
      updated: false,
      lastProcessedTelegramMessageId: state.lastProcessedTelegramMessageId,
      chronicle: loadChatChronicle(options.conversationDir),
    }
  }

  const previousChronicle = loadChatChronicle(options.conversationDir)
  const prompt = buildChroniclePrompt({
    conversationId: options.conversationId,
    previousChronicle,
    entries: pendingEntries,
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
        maxOutputTokens: Math.min(options.config.ai.limits.maxOutputTokens, 800),
      },
    },
  }

  let content = ""
  try {
    content = options.createCompletion
      ? await options.createCompletion(prompt)
      : (await generateReply({
          config: analysisConfig,
          messages: prompt,
          conversationId: options.conversationId,
        })).content
  } catch {
    content = fallbackChronicle({
      previousChronicle,
      entries: pendingEntries,
    })
  }

  const chronicle = ensureChronicleHeading(content || fallbackChronicle({
    previousChronicle,
    entries: pendingEntries,
  }))
  const nextProcessedTelegramMessageId =
    pendingEntries[pendingEntries.length - 1]?.telegramMessageId
  const paths = ensureChronicleRuntime(options.conversationDir)
  writeFileSync(paths.chronicleFile, `${chronicle}\n`)
  saveChronicleState(options.conversationDir, {
    schemaVersion: SCHEMA_VERSION,
    lastProcessedTelegramMessageId: nextProcessedTelegramMessageId,
    updatedAt: (options.now || new Date()).toISOString(),
  })
  return {
    updated: true,
    lastProcessedTelegramMessageId: nextProcessedTelegramMessageId,
    chronicle,
  }
}
