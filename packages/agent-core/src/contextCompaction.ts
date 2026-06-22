import type { Message } from "@myz/agent-providers"
import type { LLMClient, ProviderMessage } from "@myz/agent-providers"
import type { ContextConfig } from "./types"

export interface CompactionResult {
  history: Message[]
  summary: string
  compressed: boolean
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function estimateMessageTokens(msg: Message): number {
  let tokens = estimateTokens(msg.content) + 4
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      tokens += estimateTokens(tc.function.arguments) + 4
    }
  }
  return tokens
}

function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0)
}

function isToolResult(msg: Message): boolean {
  return msg.role === "tool"
}

function pairToolCallsWithResults(messages: Message[]): Message[] {
  const toolCallIds = new Set<string>()
  for (const msg of messages) {
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) toolCallIds.add(tc.id)
    }
  }
  // Keep tool results only if their tool call is present
  return messages.filter((msg) => {
    if (msg.role === "tool") return toolCallIds.has(msg.tool_call_id || "")
    return true
  })
}

async function generateSummary(
  client: LLMClient,
  model: string,
  messages: Message[],
): Promise<string> {
  const summaryPrompt: ProviderMessage[] = [
    {
      role: "system",
      content: "你是一个会话摘要助手。将以下对话历史压缩成简洁的摘要，保留关键信息：用户的目标、已完成的工作、重要的决策和发现。摘要应该足够详细，让另一个 agent 能从这个摘要继续工作。用中文输出。",
    },
    {
      role: "user",
      content: messages.map((m) => {
        const content = m.content.slice(0, 500)
        return `[${m.role}] ${content}`
      }).join("\n"),
    },
  ]

  const response = await client.complete({
    model,
    messages: summaryPrompt,
    temperature: 0.3,
    max_tokens: 2000,
  })

  return response.content || "（摘要生成失败）"
}

export async function compactContext(options: {
  messages: Message[]
  config: ContextConfig
  contextWindow: number
  maxOutputTokens: number
  client?: LLMClient
  model?: string
  systemPromptTokens?: number
  toolsTokens?: number
}): Promise<CompactionResult> {
  const {
    messages,
    config,
    contextWindow,
    maxOutputTokens,
    client,
    model,
    systemPromptTokens = 500,
    toolsTokens = 1000,
  } = options

  const overhead = systemPromptTokens + toolsTokens + maxOutputTokens
  const budget = Math.max(1024, contextWindow - overhead)

  if (config.strategy === "none") {
    return { history: messages, summary: "", compressed: false }
  }

  const totalTokens = estimateMessagesTokens(messages)
  if (totalTokens <= budget) {
    return { history: messages, summary: "", compressed: false }
  }

  // Split into recent window and old messages
  const recentBudget = Math.floor(budget * config.recentWindowRatio)
  const recent: Message[] = []
  let recentTokens = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateMessageTokens(messages[i])
    if (recent.length > 0 && recentTokens + msgTokens > recentBudget) break
    recent.unshift(messages[i])
    recentTokens += msgTokens
  }

  const oldMessages = messages.slice(0, messages.length - recent.length)
  if (!oldMessages.length) {
    return { history: messages, summary: "", compressed: false }
  }

  // Ensure tool call / result pairs are kept together
  const pairedRecent = pairToolCallsWithResults(recent)

  if (config.strategy === "token-budget" || !client || !model) {
    const summaryText = `[早期 ${oldMessages.length} 条消息已移除（token budget 限制）]`
    return {
      history: [
        { role: "user", content: summaryText, metadata: { type: "context_summary", hiddenFromHistory: true } },
        ...pairedRecent,
      ],
      summary: summaryText,
      compressed: true,
    }
  }

  // summary strategy: generate LLM summary
  const summary = await generateSummary(client, model, oldMessages)
  const summaryText = `[会话摘要 - 之前的消息已压缩]\n${summary}`

  return {
    history: [
      { role: "user", content: summaryText, metadata: { type: "context_summary", hiddenFromHistory: true } },
      ...pairedRecent,
    ],
    summary,
    compressed: true,
  }
}

/** @deprecated Use compactContext */
export function prepareSessionContext(options: {
  sessionDir: string
  sessionId: string
  messages: Message[]
  maxHistoryMessages?: number
  summaryMaxMessages?: number
  summaryMaxChars?: number
  maxHistoryChars?: number
  compressionCooldownMs?: number
  contextWindowTokens?: number
  maxOutputTokens?: number
}): { history: Message[]; summary: string; compressed: boolean } {
  return {
    history: options.messages,
    summary: "",
    compressed: false,
  }
}
