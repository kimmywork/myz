import type { Message, TokenUsage } from "@myz/ai-core/types"
import { createTerminalUi } from "./tui"

const CHARS_PER_TOKEN_ESTIMATE = 4
const MAX_CHAT_TAIL = 12

export type RuntimeMonitorPhase = "idle" | "llm" | "tool" | "send" | "error"

export type RuntimeChatRole =
  | "user"
  | "assistant"
  | "progress"
  | "error"
  | "system"
  | "scheduler"

export interface RuntimeChatEntry {
  at: string
  conversationId: string
  role: RuntimeChatRole
  text: string
}

export interface RuntimeRequestMetrics {
  conversationId: string
  source: "conversation" | "scheduler"
  requestCount: number
  durationMs: number
  contextMessages: number
  contextChars: number
  contextTokensEstimate: number
  toolCallCount: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  reasoningTokens: number
  cachedPromptTokens: number
  tokensPerSecond: number
  finishedAt: string
}

export interface RuntimeMonitorSnapshot {
  phase: RuntimeMonitorPhase
  provider: string
  model: string
  streamingEnabled: boolean
  historyMode: string
  contextCompactionStatus: string
  activeConversationId: string
  lastUpdatedAt: string
  requestCount: number
  pendingRequests: number
  totalTokens: number
  totalDurationMs: number
  contextMessages: number
  contextChars: number
  contextTokensEstimate: number
  lastRequest: RuntimeRequestMetrics | null
  chatTail: RuntimeChatEntry[]
  lastError: string
  inputEnabled: boolean
  inputLabel: string
  inputDraft: string
  inputHint: string
}

export interface RuntimeMonitor {
  notePhase: (phase: RuntimeMonitorPhase, conversationId?: string) => void
  noteIncomingMessage: (options: {
    conversationId: string
    text: string
    role?: RuntimeChatRole
  }) => void
  noteOutgoingMessage: (options: {
    conversationId: string
    text: string
    role?: RuntimeChatRole
  }) => void
  noteRequestStart: (options: {
    conversationId: string
    source: "conversation" | "scheduler"
    messages: Message[]
  }) => { startedAt: number; requestId: string }
  noteRequestComplete: (options: {
    conversationId: string
    source: "conversation" | "scheduler"
    startedAt: number
    requestId?: string
    usage?: TokenUsage
    toolCallCount?: number
  }) => void
  noteError: (options: { conversationId?: string; error: unknown }) => void
  setInputState: (options: {
    enabled?: boolean
    label?: string
    draft?: string
    hint?: string
  }) => void
  bindInput?: (options: {
    enabled?: boolean
    label?: string
    onSubmit: (text: string) => void
    onExit?: () => void
  }) => {
    enabled: boolean
    close: () => void
  }
  getSnapshot: () => RuntimeMonitorSnapshot
  close: () => void
}

interface TerminalOutput {
  isTTY?: boolean
  columns?: number
  rows?: number
  write: (chunk: string) => boolean
}

function normalizeText(value: string, maxChars = 240) {
  const text = value.replace(/\s+/g, " ").trim()
  if (!text) return ""
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars - 3)}...`
}

function normalizeChatText(value: string) {
  const text = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim()
  if (!text) return ""
  return text
}

function estimateMessageChars(message: Message) {
  const content = typeof message.content === "string" ? message.content.length : 0
  const toolCalls = Array.isArray(message.tool_calls)
    ? JSON.stringify(message.tool_calls).length
    : 0
  return content + toolCalls + 64
}

function estimateContext(messages: Message[]) {
  const contextMessages = messages.length
  const contextChars = messages.reduce((sum, message) => sum + estimateMessageChars(message), 0)
  const contextTokensEstimate = Math.max(
    0,
    Math.ceil(contextChars / CHARS_PER_TOKEN_ESTIMATE),
  )
  return {
    contextMessages,
    contextChars,
    contextTokensEstimate,
  }
}

function usageNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function usageTotals(usage?: TokenUsage) {
  const usageRecord = usage as Record<string, unknown> | undefined
  const inputDetails =
    usageRecord?.input_tokens_details &&
    typeof usageRecord.input_tokens_details === "object"
      ? (usageRecord.input_tokens_details as Record<string, unknown>)
      : undefined
  const outputDetails =
    usageRecord?.output_tokens_details &&
    typeof usageRecord.output_tokens_details === "object"
      ? (usageRecord.output_tokens_details as Record<string, unknown>)
      : undefined

  return {
    totalTokens: usageNumber(usageRecord?.total_tokens ?? usageRecord?.totalTokens),
    promptTokens: usageNumber(
      usageRecord?.prompt_tokens ??
        usageRecord?.promptTokens ??
        usageRecord?.input_tokens ??
        usageRecord?.inputTokens,
    ),
    completionTokens: usageNumber(
      usageRecord?.completion_tokens ??
        usageRecord?.completionTokens ??
        usageRecord?.output_tokens ??
        usageRecord?.outputTokens,
    ),
    reasoningTokens: usageNumber(
      usageRecord?.reasoning_tokens ??
        usageRecord?.reasoningTokens ??
        outputDetails?.reasoning_tokens ??
        outputDetails?.reasoningTokens,
    ),
    cachedPromptTokens: usageNumber(
      usageRecord?.cached_prompt_tokens ??
        usageRecord?.cachedPromptTokens ??
        inputDetails?.cached_tokens ??
        inputDetails?.cachedTokens,
    ),
  }
}

function formatDurationMs(durationMs: number) {
  if (durationMs <= 0) return "0.00s"
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 1 : 2)}s`
}

function formatTokensPerSecond(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "n/a"
  return value >= 100 ? `${value.toFixed(0)}/s` : `${value.toFixed(1)}/s`
}

function formatTimestamp(value: string) {
  const normalized = value.trim()
  if (!normalized) return "-"
  return normalized.slice(11, 19) || normalized
}

function truncateLine(value: string, width: number) {
  if (value.length <= width) return value
  if (width <= 1) return value.slice(0, width)
  return `${value.slice(0, width - 1)}…`
}

export function formatRuntimeMonitorScreen(
  snapshot: RuntimeMonitorSnapshot,
  options: { width?: number; height?: number } = {},
) {
  const width = Math.max(60, options.width ?? 100)
  const height = Math.max(12, options.height ?? 24)
  const lastRequest = snapshot.lastRequest
  const lines = [
    "MyZ Bot Runtime",
    [
      `phase=${snapshot.phase}`,
      `provider=${snapshot.provider}`,
      `model=${snapshot.model}`,
      `stream=${snapshot.streamingEnabled ? "on" : "off"}`,
    ].join(" | "),
    [
      `conversation=${snapshot.activeConversationId || "-"}`,
      `requests=${snapshot.requestCount}`,
      `pending=${snapshot.pendingRequests}`,
      `tokens=${snapshot.totalTokens}`,
      `runtime=${formatDurationMs(snapshot.totalDurationMs)}`,
    ].join(" | "),
    [
      `context=${snapshot.contextMessages} msg`,
      `${snapshot.contextChars} ch`,
      `~${snapshot.contextTokensEstimate} tok`,
      `last_tps=${formatTokensPerSecond(lastRequest?.tokensPerSecond || 0)}`,
    ].join(" | "),
    [
      `history=${snapshot.historyMode}`,
      `compaction=${snapshot.contextCompactionStatus}`,
      `updated=${snapshot.lastUpdatedAt || "-"}`,
    ].join(" | "),
    lastRequest
      ? [
          `last=${lastRequest.source}`,
          `dur=${formatDurationMs(lastRequest.durationMs)}`,
          `tps=${formatTokensPerSecond(lastRequest.tokensPerSecond)}`,
          `req_tokens=${lastRequest.totalTokens}`,
          `tools=${lastRequest.toolCallCount}`,
        ].join(" | ")
      : "last=none",
    lastRequest
      ? [
          `prompt=${lastRequest.promptTokens}`,
          `cached=${lastRequest.cachedPromptTokens}`,
          `completion=${lastRequest.completionTokens}`,
          `reasoning=${lastRequest.reasoningTokens}`,
          `finished=${formatTimestamp(lastRequest.finishedAt)}`,
        ].join(" | ")
      : "usage=none",
    snapshot.lastError ? `error=${snapshot.lastError}` : "error=-",
    "",
    "Recent Chat",
  ]

  const inputLines = snapshot.inputEnabled ? 3 : 0
  const reserved = lines.length + inputLines
  const availableTail = Math.max(3, height - reserved)
  const tail = snapshot.chatTail.slice(-availableTail)
  tail.forEach((entry) => {
    const prefix = `[${entry.at}] ${entry.role}:${entry.conversationId}`
    lines.push(`${prefix} ${entry.text}`.trim())
  })

  if (snapshot.inputEnabled) {
    lines.push("")
    lines.push(snapshot.inputHint || "Local TUI chat")
    lines.push(`${snapshot.inputLabel || "local"}> ${snapshot.inputDraft || ""}`)
  }

  return lines
    .slice(0, height)
    .map((line) => truncateLine(line, width))
    .join("\n")
}

export function createRuntimeMonitor(options: {
  provider: string
  model: string
  streamingEnabled: boolean
  historyMode: string
  contextCompactionStatus: string
  enabled?: boolean
  input?: NodeJS.ReadStream
  output?: TerminalOutput
  now?: () => Date
}): RuntimeMonitor {
  const output = options.output || process.stdout
  const enabled = options.enabled !== false
  const now = options.now || (() => new Date())
  const interactive = Boolean(enabled && output.isTTY)
  const terminalUi =
    interactive && (!options.output || output === process.stdout)
      ? (() => {
          try {
            return createTerminalUi({
              input: options.input || process.stdin,
              output: process.stdout,
            })
          } catch {
            return null
          }
        })()
      : null
  let closed = false
  let renderQueued = false
  const activeRequests = new Map<
    string,
    {
      requestCount: number
      contextMessages: number
      contextChars: number
      contextTokensEstimate: number
    }
  >()
  const snapshot: RuntimeMonitorSnapshot = {
    phase: "idle",
    provider: options.provider,
    model: options.model,
    streamingEnabled: options.streamingEnabled,
    historyMode: options.historyMode,
    contextCompactionStatus: options.contextCompactionStatus,
    activeConversationId: "",
    lastUpdatedAt: now().toISOString(),
    requestCount: 0,
    pendingRequests: 0,
    totalTokens: 0,
    totalDurationMs: 0,
    contextMessages: 0,
    contextChars: 0,
    contextTokensEstimate: 0,
    lastRequest: null,
    chatTail: [],
    lastError: "",
    inputEnabled: false,
    inputLabel: "local",
    inputDraft: "",
    inputHint: "",
  }

  const render = () => {
    renderQueued = false
    if (closed || !interactive) return
    if (terminalUi) {
      terminalUi.render(snapshot)
      return
    }
    const width = output.columns || 100
    const height = output.rows || 24
    const screen = formatRuntimeMonitorScreen(snapshot, { width, height })
    output.write(`\x1b[?25l\x1b[2J\x1b[H${screen}\n`)
  }

  const queueRender = () => {
    snapshot.lastUpdatedAt = now().toISOString()
    if (!interactive || renderQueued || closed) return
    renderQueued = true
    setTimeout(render, 0).unref?.()
  }

  const pushChat = (entry: RuntimeChatEntry) => {
    snapshot.chatTail.push(entry)
    if (snapshot.chatTail.length > MAX_CHAT_TAIL) {
      snapshot.chatTail.splice(0, snapshot.chatTail.length - MAX_CHAT_TAIL)
    }
  }

  const setConversation = (conversationId?: string) => {
    if (!conversationId) return
    snapshot.activeConversationId = conversationId
  }

  const close = () => {
    if (closed) return
    closed = true
    terminalUi?.destroy()
    if (interactive && !terminalUi) {
      output.write("\x1b[?25h")
    }
  }

  if (interactive) {
    process.once("exit", close)
    queueRender()
  }

  return {
    notePhase(phase, conversationId) {
      snapshot.phase = phase
      setConversation(conversationId)
      queueRender()
    },

    noteIncomingMessage({ conversationId, text, role = "user" }) {
      setConversation(conversationId)
      pushChat({
        at: now().toISOString().slice(11, 19),
        conversationId,
        role,
        text: normalizeChatText(text),
      })
      queueRender()
    },

    noteOutgoingMessage({ conversationId, text, role = "assistant" }) {
      setConversation(conversationId)
      pushChat({
        at: now().toISOString().slice(11, 19),
        conversationId,
        role,
        text: normalizeChatText(text),
      })
      queueRender()
    },

    noteRequestStart({ conversationId, source, messages }) {
      const context = estimateContext(messages)
      const requestId = `${snapshot.requestCount + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      snapshot.requestCount += 1
      snapshot.contextMessages = context.contextMessages
      snapshot.contextChars = context.contextChars
      snapshot.contextTokensEstimate = context.contextTokensEstimate
      snapshot.phase = "llm"
      setConversation(conversationId)
      activeRequests.set(requestId, {
        requestCount: snapshot.requestCount,
        contextMessages: context.contextMessages,
        contextChars: context.contextChars,
        contextTokensEstimate: context.contextTokensEstimate,
      })
      snapshot.pendingRequests = activeRequests.size
      snapshot.lastRequest = {
        conversationId,
        source,
        requestCount: snapshot.requestCount,
        durationMs: 0,
        contextMessages: context.contextMessages,
        contextChars: context.contextChars,
        contextTokensEstimate: context.contextTokensEstimate,
        toolCallCount: 0,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        reasoningTokens: 0,
        cachedPromptTokens: 0,
        tokensPerSecond: 0,
        finishedAt: "",
      }
      queueRender()
      return { startedAt: Date.now(), requestId }
    },

    noteRequestComplete({
      conversationId,
      source,
      startedAt,
      requestId,
      usage,
      toolCallCount = 0,
    }) {
      const durationMs = Math.max(0, Date.now() - startedAt)
      const totals = usageTotals(usage)
      const tokensPerSecond =
        durationMs > 0 && totals.totalTokens > 0
          ? totals.totalTokens / (durationMs / 1000)
          : 0
      const requestContext =
        (requestId ? activeRequests.get(requestId) : undefined) || {
          requestCount: snapshot.requestCount,
          contextMessages: snapshot.contextMessages,
          contextChars: snapshot.contextChars,
          contextTokensEstimate: snapshot.contextTokensEstimate,
        }
      if (requestId) {
        activeRequests.delete(requestId)
      }
      snapshot.pendingRequests = activeRequests.size
      snapshot.totalTokens += totals.totalTokens
      snapshot.totalDurationMs += durationMs
      snapshot.lastRequest = {
        conversationId,
        source,
        requestCount: requestContext.requestCount,
        durationMs,
        contextMessages: requestContext.contextMessages,
        contextChars: requestContext.contextChars,
        contextTokensEstimate: requestContext.contextTokensEstimate,
        toolCallCount,
        totalTokens: totals.totalTokens,
        promptTokens: totals.promptTokens,
        completionTokens: totals.completionTokens,
        reasoningTokens: totals.reasoningTokens,
        cachedPromptTokens: totals.cachedPromptTokens,
        tokensPerSecond,
        finishedAt: now().toISOString(),
      }
      setConversation(conversationId)
      queueRender()
    },

    noteError({ conversationId, error }) {
      snapshot.phase = "error"
      setConversation(conversationId)
      snapshot.lastError =
        error instanceof Error ? normalizeText(error.message, 180) : normalizeText(String(error), 180)
      queueRender()
    },

    setInputState({ enabled, label, draft, hint }) {
      if (typeof enabled === "boolean") {
        snapshot.inputEnabled = enabled
      }
      if (typeof label === "string") {
        snapshot.inputLabel = label
      }
      if (typeof draft === "string") {
        snapshot.inputDraft = draft
      }
      if (typeof hint === "string") {
        snapshot.inputHint = hint
      }
      queueRender()
    },

    bindInput({ enabled, label, onSubmit, onExit }) {
      if (typeof enabled === "boolean") {
        snapshot.inputEnabled = enabled
      }
      if (typeof label === "string") {
        snapshot.inputLabel = label
      }
      if (!terminalUi || snapshot.inputEnabled === false) {
        queueRender()
        return {
          enabled: false,
          close() {
            snapshot.inputEnabled = false
            snapshot.inputDraft = ""
            queueRender()
          },
        }
      }

      const binding = terminalUi.bindInput({
        onSubmit(text) {
          snapshot.inputDraft = ""
          queueRender()
          onSubmit(text)
        },
        onExit,
        onChange(draft) {
          snapshot.inputDraft = draft
          queueRender()
        },
      })
      queueRender()
      return {
        enabled: binding.enabled,
        close() {
          binding.close()
          snapshot.inputEnabled = false
          snapshot.inputDraft = ""
          queueRender()
        },
      }
    },

    getSnapshot() {
      return {
        ...snapshot,
        chatTail: [...snapshot.chatTail],
        lastRequest: snapshot.lastRequest ? { ...snapshot.lastRequest } : null,
      }
    },

    close,
  }
}
