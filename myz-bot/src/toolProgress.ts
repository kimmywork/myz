import type { ProviderMessage } from "@myz/ai-core/providers/types"
import { generateReply } from "./ai"
import type { BotRuntimeConfig } from "./config"
import { createSystemMessage, createUserMessage } from "./conversations"
import { sendRecordedTelegramMessage } from "./telegramDelivery"
import type { TelegramClient, TelegramSendMessageOptions } from "./telegram"

const TOOL_RESULT_MAX_CHARS = 280
const TOOL_PROGRESS_MAX_CHARS = 180

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function normalizeComparisonText(value: string) {
  return normalizeWhitespace(value).toLowerCase()
}

function collapseRepeatedProgressText(value: string) {
  const normalized = value.replace(/\r\n/g, "\n").trim()
  if (!normalized) return ""
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length >= 2 && lines.every((line) => line === lines[0])) {
    return lines[0] || ""
  }
  if (normalized.length % 2 === 0) {
    const half = normalized.length / 2
    const first = normalized.slice(0, half).trim()
    const second = normalized.slice(half).trim()
    if (first && first === second) {
      return first
    }
  }
  return normalized
}

function normalizeProgressText(value: string) {
  const normalized = collapseRepeatedProgressText(
    value
      .replace(/```[\s\S]*?```/g, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim(),
  )
  if (!normalized) return ""
  if (normalized.length <= TOOL_PROGRESS_MAX_CHARS) return normalized
  return `${normalized.slice(0, TOOL_PROGRESS_MAX_CHARS - 3).trim()}...`
}

function sanitizeAssistantDraft(value: string) {
  return normalizeProgressText(
    value.replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim(),
  )
}

function summarizeValue(value: unknown, maxChars = 80) {
  const text =
    typeof value === "string"
      ? normalizeWhitespace(value)
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : ""
  if (!text) return ""
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars - 3)}...`
}

function parseToolArgs(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return {} as Record<string, unknown>
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeToolName(rawName: unknown) {
  const name = typeof rawName === "string" ? rawName.trim() : ""
  if (!name) return "UnknownTool"
  const last = name.split(":").pop()?.trim()
  return last || name
}

function isInternalTool(rawName: unknown) {
  const normalized = normalizeToolName(rawName)
  return normalized === "SelectTools"
}

function summarizeToolArgs(rawArgs: unknown) {
  const parsed = parseToolArgs(rawArgs)
  const priorityKeys = [
    "path",
    "command",
    "title",
    "target",
    "taskId",
    "action",
    "dueAt",
    "pattern",
    "message",
  ]
  const picked = priorityKeys
    .map((key) => {
      const value = summarizeValue(parsed[key])
      return value ? `${key}=${value}` : ""
    })
    .filter(Boolean)
    .slice(0, 3)
  if (picked.length) {
    return picked.join(" | ")
  }
  const raw =
    typeof rawArgs === "string" ? normalizeWhitespace(rawArgs) : ""
  if (!raw) return ""
  if (raw.length <= 120) return raw
  return `${raw.slice(0, 117)}...`
}

function summarizeToolResult(content: string) {
  const text = normalizeWhitespace(content)
  if (!text) return ""
  if (text.length <= TOOL_RESULT_MAX_CHARS) return text
  return `${text.slice(0, TOOL_RESULT_MAX_CHARS - 3)}...`
}

function combineResultSummaries(summaries: string[]) {
  const combined = Array.from(
    new Set(
      summaries
        .map((summary) => summarizeToolResult(summary))
        .filter(Boolean),
    ),
  ).slice(0, 3)
  if (!combined.length) return ""
  return summarizeToolResult(combined.join(" | "))
}

function buildFallbackStartMessage(options: {
  toolNames: string[]
  toolArgsSummary?: string
}) {
  const clue = normalizeWhitespace(options.toolArgsSummary || "")
  if (clue) {
    return normalizeProgressText(`我先看一下 ${clue}，很快回来。`)
  }
  const toolName = options.toolNames[0] || ""
  if (toolName) {
    return normalizeProgressText(`我先去确认一下这一步，看看 ${toolName} 这边拿到什么。`)
  }
  return "我先看一下这一步的情况。"
}

function buildFallbackResultMessage(options: {
  toolNames: string[]
  resultSummary?: string
}) {
  const summary = summarizeToolResult(options.resultSummary || "")
  if (/^error:/i.test(summary)) {
    return normalizeProgressText(`这一步卡了一下，报错是：${summary}`)
  }
  if (summary) {
    return normalizeProgressText(`我刚看到的关键信息是：${summary}`)
  }
  const toolName = options.toolNames[0] || ""
  if (toolName) {
    return normalizeProgressText(`这一步已经有结果了，我接着看 ${toolName} 后面的情况。`)
  }
  return "这一步已经有结果了，我继续往下处理。"
}

function getToolNameFromProviderMessage(message: ProviderMessage) {
  const metadata =
    "metadata" in message && message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : null
  return typeof metadata?.toolName === "string" ? metadata.toolName : ""
}

export async function draftToolProgressMessage(options: {
  config: BotRuntimeConfig
  conversationId: string
  soul: string
  latestUserInput: string
  phase: "start" | "result"
  assistantDraft?: string
  toolNames: string[]
  toolArgsSummary?: string
  resultSummary?: string
}) {
  const assistantDraft = sanitizeAssistantDraft(options.assistantDraft || "")
  if (assistantDraft) {
    return assistantDraft
  }

  const config: BotRuntimeConfig = {
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
        maxOutputTokens: Math.min(options.config.ai.limits.maxOutputTokens, 120),
      },
    },
  }

  const prompt = [
    createSystemMessage(
      options.conversationId,
      [
        "你是在同一轮对话里替 assistant 写一条很短的过程反馈。",
        "目标：像正常人聊天，不像系统日志。",
        "要求：",
        "- 只写一小段中文，1 到 2 句。",
        "- 要自然、有人味，不要机械播报。",
        "- 除非非常自然，否则不要出现“调用工具”“工具完成”“参数”“JSON”“系统”“模型”“函数”这些词。",
        "- start 阶段：像在告诉对方你正准备先看什么、查什么、确认什么。",
        "- result 阶段：像在告诉对方你刚刚看到了什么关键结果，必要时带一句下一步。",
        "- 保持 SOUL 的语气，不要突然变成客服或系统提示。",
        "- 不要编造未提供的结果。",
        "- 只输出最终短消息，不要解释。",
      ].join("\n"),
    ),
    createUserMessage(
      options.conversationId,
      [
        `SOUL 摘要：${options.soul.slice(0, 800)}`,
        `用户这轮请求：${options.latestUserInput.trim()}`,
        `阶段：${options.phase}`,
        `相关动作：${options.toolNames.join("、") || "无"}`,
        options.toolArgsSummary ? `动作线索：${options.toolArgsSummary}` : "",
        options.resultSummary ? `当前结果线索：${options.resultSummary}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ]

  try {
    const reply = await generateReply({
      config,
      messages: prompt,
      conversationId: options.conversationId,
      temperature: 0.6,
    })
    const drafted = normalizeProgressText(reply.content || "")
    if (drafted) return drafted
  } catch {
    // Fall back to a lightweight natural sentence if the helper LLM fails.
  }

  return options.phase === "start"
    ? buildFallbackStartMessage({
        toolNames: options.toolNames,
        toolArgsSummary: options.toolArgsSummary,
      })
    : buildFallbackResultMessage({
        toolNames: options.toolNames,
        resultSummary: options.resultSummary,
      })
}

export function createToolProgressNotifier(options: {
  config: BotRuntimeConfig
  telegram: TelegramClient
  conversationDir: string
  conversationId: string
  chatId: number
  latestUserInput: string
  soul: string
  sendOptions?: TelegramSendMessageOptions
  draftMessage?: typeof draftToolProgressMessage
}) {
  let queue = Promise.resolve()
  const startedToolIds = new Set<string>()
  const toolNamesById = new Map<string, string>()
  const draftMessage = options.draftMessage || draftToolProgressMessage
  let lastSentProgressText = ""
  let currentBatch:
    | {
        toolIds: Set<string>
        toolNames: string[]
        resultSummaries: string[]
        startSent: boolean
      }
    | null = null

  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task, task).catch(() => undefined)
  }

  const appendUnique = (list: string[], value: string) => {
    const normalized = normalizeWhitespace(value)
    if (!normalized) return
    if (!list.includes(normalized)) {
      list.push(normalized)
    }
  }

  const getOrCreateBatch = () => {
    if (!currentBatch) {
      currentBatch = {
        toolIds: new Set<string>(),
        toolNames: [],
        resultSummaries: [],
        startSent: false,
      }
    }
    return currentBatch
  }

  const shouldSendProgressText = (text: string) => {
    const normalized = normalizeComparisonText(text)
    if (!normalized) return false
    if (normalized === lastSentProgressText) return false
    lastSentProgressText = normalized
    return true
  }

  return {
    onToolCallMessage(message: ProviderMessage) {
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : []
      const publicToolCalls = toolCalls.filter(
        (toolCall) => !isInternalTool(toolCall.function?.name),
      )
      publicToolCalls.forEach((toolCall) => {
        if (!toolCall?.id || startedToolIds.has(toolCall.id)) return
        startedToolIds.add(toolCall.id)
        toolNamesById.set(toolCall.id, normalizeToolName(toolCall.function?.name))
      })
      if (!publicToolCalls.length) return

      const batch = getOrCreateBatch()
      publicToolCalls.forEach((toolCall) => {
        if (toolCall?.id) {
          batch.toolIds.add(toolCall.id)
        }
        appendUnique(batch.toolNames, normalizeToolName(toolCall.function?.name))
      })
      if (batch.startSent) return
      batch.startSent = true

      enqueue(async () => {
        const assistantDraft = typeof message.content === "string" ? message.content : ""
        const toolNames = publicToolCalls.map((toolCall) =>
          normalizeToolName(toolCall.function?.name),
        )
        const toolArgsSummary = publicToolCalls
          .map((toolCall) => summarizeToolArgs(toolCall.function?.arguments))
          .filter(Boolean)
          .join(" | ")
        const text = await draftMessage({
          config: options.config,
          conversationId: options.conversationId,
          soul: options.soul,
          latestUserInput: options.latestUserInput,
          phase: "start",
          assistantDraft,
          toolNames,
          toolArgsSummary,
        })
        if (!shouldSendProgressText(text)) return
        await sendRecordedTelegramMessage({
          telegram: options.telegram,
          conversationDir: options.conversationDir,
          conversationId: options.conversationId,
          chatId: options.chatId,
          text,
          sendOptions: options.sendOptions,
          kind: "progress",
        })
      })
    },

    onToolResultMessage(message: ProviderMessage) {
      const toolNameFromMetadata = getToolNameFromProviderMessage(message)
      const toolCallId = message.tool_call_id || ""
      const toolName = toolNameFromMetadata || toolNamesById.get(toolCallId)
      if (!toolName || isInternalTool(toolName)) return
      const batch = getOrCreateBatch()
      appendUnique(batch.toolNames, normalizeToolName(toolName))
      appendUnique(
        batch.resultSummaries,
        typeof message.content === "string" ? message.content : "",
      )
      if (toolCallId) {
        batch.toolIds.delete(toolCallId)
      }
      if (batch.toolIds.size > 0) return

      const completedBatch = batch
      currentBatch = null
      enqueue(async () => {
        const text = await draftMessage({
          config: options.config,
          conversationId: options.conversationId,
          soul: options.soul,
          latestUserInput: options.latestUserInput,
          phase: "result",
          toolNames: completedBatch.toolNames,
          resultSummary: combineResultSummaries(completedBatch.resultSummaries),
        })
        if (!shouldSendProgressText(text)) return
        await sendRecordedTelegramMessage({
          telegram: options.telegram,
          conversationDir: options.conversationDir,
          conversationId: options.conversationId,
          chatId: options.chatId,
          text,
          sendOptions: options.sendOptions,
          kind: "progress",
        })
      })
    },

    async flush() {
      await queue
    },
  }
}
