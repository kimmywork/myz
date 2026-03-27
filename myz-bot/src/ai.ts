import {
  createProviderSession,
} from "@myz/ai-core/runtime/providerSession"
import { buildConversationPromptMessages } from "@myz/ai-core/prompt/conversation"
import type { Message, TokenUsage } from "@myz/ai-core/types"
import type {
  ProviderChatCompletionRequest,
  ProviderMessage,
  ProviderToolChoice,
} from "@myz/ai-core/providers/types"
import type {
  AIProviderSetting,
  AIModelSetting,
  McpServerSetting,
  AIToolChoiceMode,
  AIToolFlagSetting,
  AIToolChoiceSetting,
  AIToolControlSettings,
} from "@myz/ai-core/settings"
import type { BotRuntimeConfig } from "./config"
import { writeLlmRequestDebugLog } from "./debug"
import { withRetry } from "./retry"

function normalizeHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, string> {
  const normalized: Record<string, string> = {}
  if (!headers) return normalized
  Object.entries(headers).forEach(([key, value]) => {
    if (typeof value === "string") {
      normalized[key] = value
      return
    }
    if (typeof value === "number" || typeof value === "boolean") {
      normalized[key] = String(value)
    }
  })
  return normalized
}

function headersToString(headers: Record<string, string>) {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
}

function normalizeToolChoice(
  setting: AIToolChoiceSetting | undefined,
): ProviderToolChoice | undefined {
  if (!setting) return undefined
  const mode = setting.mode
  if (mode === "auto" || mode === "none" || mode === "required") return mode
  if (mode === "tool" && setting.toolName) {
    return { type: "function", function: { name: setting.toolName } }
  }
  return undefined
}

function normalizeFlag(value: AIToolFlagSetting | undefined) {
  if (value === "on") return true
  if (value === "off") return false
  return undefined
}

function normalizeTooling(settings: AIToolControlSettings | undefined) {
  if (!settings) return undefined
  return {
    toolChoice: normalizeToolChoice(settings.toolChoice),
    strict: normalizeFlag(settings.strict),
    parallelToolCalls: normalizeFlag(settings.parallelToolCalls),
  }
}

function normalizeProviderMessageContent(content: ProviderMessage["content"]) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return ""
      if (part.type === "text" && typeof part.text === "string") {
        return part.text
      }
      if (part.type === "image_url") {
        return "[Image omitted]"
      }
      return ""
    })
    .filter(Boolean)
    .join("\n")
}

function readUsageNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
  }
  return undefined
}

function normalizeTokenUsage(usage: unknown): TokenUsage | undefined {
  if (!usage || typeof usage !== "object") return undefined
  const record = usage as Record<string, unknown>
  const inputDetails =
    record.input_tokens_details &&
    typeof record.input_tokens_details === "object" &&
    record.input_tokens_details !== null
      ? (record.input_tokens_details as Record<string, unknown>)
      : undefined
  const outputDetails =
    record.output_tokens_details &&
    typeof record.output_tokens_details === "object" &&
    record.output_tokens_details !== null
      ? (record.output_tokens_details as Record<string, unknown>)
      : undefined

  const promptTokens = readUsageNumber(record, [
    "prompt_tokens",
    "promptTokens",
    "input_tokens",
    "inputTokens",
  ])
  const completionTokens = readUsageNumber(record, [
    "completion_tokens",
    "completionTokens",
    "output_tokens",
    "outputTokens",
  ])
  const reasoningTokens =
    readUsageNumber(record, ["reasoning_tokens", "reasoningTokens"]) ??
    (outputDetails
      ? readUsageNumber(outputDetails, ["reasoning_tokens", "reasoningTokens"])
      : undefined)
  const cachedPromptTokens =
    readUsageNumber(record, ["cached_prompt_tokens", "cachedPromptTokens"]) ??
    (inputDetails
      ? readUsageNumber(inputDetails, ["cached_tokens", "cachedTokens"])
      : undefined)

  return {
    ...record,
    ...(promptTokens != null
      ? {
          prompt_tokens: promptTokens,
          promptTokens: promptTokens,
        }
      : {}),
    ...(completionTokens != null
      ? {
          completion_tokens: completionTokens,
          completionTokens: completionTokens,
        }
      : {}),
    ...(reasoningTokens != null
      ? {
          reasoning_tokens: reasoningTokens,
          reasoningTokens: reasoningTokens,
        }
      : {}),
    ...(cachedPromptTokens != null
      ? {
          cached_prompt_tokens: cachedPromptTokens,
          cachedPromptTokens: cachedPromptTokens,
        }
      : {}),
  }
}

export function mapSystemMessagesToUserMessages(
  messages: ProviderMessage[],
  enabled: boolean,
) {
  if (!enabled) return messages
  return messages.map((message) => {
    if (message.role !== "system" && message.role !== "developer") {
      return message
    }
    return {
      ...message,
      role: "user" as const,
      content: [
        "[System Instruction]",
        normalizeProviderMessageContent(message.content),
      ]
        .filter(Boolean)
        .join("\n\n"),
    }
  })
}

function buildModel(config: BotRuntimeConfig): AIModelSetting {
  const limits = config.ai.limits
  const tooling = config.ai.tooling
  return {
    id: "bot-model",
    model: config.ai.model,
    enabled: true,
    capabilities: {
      vision: Boolean(config.ai.capabilities?.vision),
      imageOutput: Boolean(config.ai.capabilities?.imageOutput),
      toolCalling: Boolean(config.ai.capabilities?.toolCalling),
      reasoning: Boolean(config.ai.capabilities?.reasoning),
    },
    limits: {
      contextWindow: limits.contextWindow,
      maxOutputTokens: limits.maxOutputTokens,
      maxOutputTokenParam: limits.maxOutputTokenParam,
    },
    tooling: {
      toolChoice: {
        mode: tooling.toolChoice as AIToolChoiceMode,
      },
      strict: tooling.strict as AIToolFlagSetting,
      parallelToolCalls: tooling.parallelToolCalls as AIToolFlagSetting,
    },
    systemPromptInUserMessage: Boolean(config.ai.systemPromptInUserMessage),
  }
}

function buildProvider(config: BotRuntimeConfig, model: AIModelSetting): AIProviderSetting {
  const headers = normalizeHeaders(config.ai.headers)
  return {
    id: "bot-provider",
    name: "myz-bot",
    type: config.ai.provider as AIProviderSetting["type"],
    enabled: true,
    streamingEnabled: true,
    baseUrl: config.ai.baseUrl || "",
    apiKey: config.ai.accessToken || "",
    headers: headersToString(headers),
    models: [model],
    lastTest: {
      ok: true,
      message: "boot",
      testedAt: new Date().toISOString(),
      model: model.model,
    },
  }
}

function buildMcpServers(config: BotRuntimeConfig): McpServerSetting[] {
  return (config.mcpServers || []).map((server, index) => ({
    id: server.id || `mcp-${index}`,
    name: server.name,
    enabled: server.enabled !== false,
    url: server.url,
    headers: normalizeHeaders(server.headers),
    lastTest: null,
  }))
}

function shouldRetryLlmError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /fetch failed|network|timeout|429|5\d\d|temporar/i.test(message)
}

function buildResponsesExtraBody(
  config: BotRuntimeConfig,
  conversationId?: string,
) {
  if (config.ai.provider !== "openai_responses") {
    return undefined
  }

  const scope =
    typeof conversationId === "string" && conversationId.trim()
      ? conversationId.trim()
      : "session"

  return {
    prompt_cache_key: `myz-bot:${config.workspaceId}:${scope}`,
  }
}

function readResponsesPromptCacheKey(extraBody: ProviderChatCompletionRequest["extra_body"]) {
  return extraBody &&
    typeof extraBody.prompt_cache_key === "string" &&
    extraBody.prompt_cache_key.trim()
    ? extraBody.prompt_cache_key.trim()
    : undefined
}

function hasEphemeralResponsesContext(messages: Message[]) {
  return messages.some((message) => {
    return (
      message?.metadata?.hiddenFromHistory === true ||
      message?.metadata?.type === "context_injection"
    )
  })
}

function buildResponsesContinuationRequest(options: {
  config: BotRuntimeConfig
  model: AIModelSetting
  messages: Message[]
  payload: ProviderMessage[]
}) {
  if (options.config.ai.provider !== "openai_responses") {
    return null
  }

  if (options.model.systemPromptInUserMessage) {
    return null
  }

  let previousResponseId = ""
  let lastAssistantIndex = -1
  options.messages.forEach((message, index) => {
    if (message.role !== "assistant") return
    const resumable =
      typeof message.metadata?.providerResponseResumable === "boolean"
        ? message.metadata.providerResponseResumable
        : true
    if (!resumable) {
      previousResponseId = ""
      lastAssistantIndex = -1
      return
    }
    const responseId =
      typeof message.metadata?.providerResponseId === "string"
        ? message.metadata.providerResponseId.trim()
        : ""
    if (!responseId) return
    previousResponseId = responseId
    lastAssistantIndex = index
  })

  if (!previousResponseId || lastAssistantIndex < 0) {
    return null
  }

  const instructions = options.payload.filter(
    (message) => message.role === "system" || message.role === "developer",
  )
  const deltaMessages = options.payload
    .slice(lastAssistantIndex + 1)
    .filter((message) => message.role !== "system" && message.role !== "developer")

  if (!deltaMessages.length) {
    return null
  }

  return {
    previousResponseId,
    messages: [...instructions, ...deltaMessages],
  }
}

function readProviderResponseId(response: unknown) {
  if (!response || typeof response !== "object") return undefined
  const record = response as Record<string, unknown>
  return typeof record.id === "string" && record.id.trim()
    ? record.id.trim()
    : undefined
}

export async function generateReply(options: {
  config: BotRuntimeConfig
  messages: Message[]
  temperature?: number
  conversationId?: string
  onToolCallMessage?: (message: ProviderMessage) => void | Promise<void>
  onToolResultMessage?: (message: ProviderMessage) => void | Promise<void>
}) {
  const model = buildModel(options.config)
  const provider = buildProvider(options.config, model)
  const mcpServers = buildMcpServers(options.config)
  const session = createProviderSession(provider, mcpServers)

  const useTools = Boolean(model.capabilities.toolCalling)
  if (useTools) {
    await session.connectMcp()
    if (options.conversationId) {
      session.mcp.setConversationContext({
        conversationId: options.conversationId,
      })
    }
  }

  try {
    const payload = mapSystemMessagesToUserMessages(
      buildConversationPromptMessages(options.messages, {
        includeVision: Boolean(model.capabilities.vision),
      }),
      Boolean(model.systemPromptInUserMessage),
    )
    const continuationRequest = buildResponsesContinuationRequest({
      config: options.config,
      model,
      messages: options.messages,
      payload,
    })
    const responseResumable =
      options.config.ai.provider === "openai_responses" &&
      !model.systemPromptInUserMessage &&
      !hasEphemeralResponsesContext(options.messages)
    const responsesExtraBody = buildResponsesExtraBody(
      options.config,
      options.conversationId,
    )
    const toolTrace: ProviderMessage[] = []
    const toolCallbackTasks: Promise<void>[] = []
    const stream =
      options.config.ai.provider === "openai_responses"

    const enqueueToolCallback = (
      handler: ((message: ProviderMessage) => void | Promise<void>) | undefined,
      message: ProviderMessage,
    ) => {
      toolTrace.push(message)
      if (!handler) return
      const task = Promise.resolve(handler(message)).catch(() => undefined)
      toolCallbackTasks.push(task)
    }

    const request: ProviderChatCompletionRequest = {
      model: model.model,
      messages: continuationRequest?.messages || payload,
      temperature: typeof options.temperature === "number" ? options.temperature : 0.7,
      stream,
      ...(continuationRequest?.previousResponseId
        ? { previous_response_id: continuationRequest.previousResponseId }
        : {}),
      ...(responsesExtraBody ? { extra_body: responsesExtraBody } : {}),
    }

    if (model.limits.maxOutputTokenParam === "max_completion_tokens") {
      request.max_completion_tokens = model.limits.maxOutputTokens
    } else {
      request.max_tokens = model.limits.maxOutputTokens
    }

    const client = useTools ? session.clientWithTools : session.client
    const response = await withRetry(
      async () =>
        client.createCompletion(request, {
          tooling: normalizeTooling(model.tooling),
          enableGeminiThinking: Boolean(model.capabilities.reasoning),
          debug: {
            onRequest: async (record) => {
              await writeLlmRequestDebugLog({
                config: options.config,
                conversationId: options.conversationId,
                record,
              })
            },
          },
          onToolCallMessage: async (message) => {
            enqueueToolCallback(options.onToolCallMessage, message)
          },
          onToolResultMessage: async (message) => {
            enqueueToolCallback(options.onToolResultMessage, message)
          },
        }),
      {
        retries: Math.max(0, options.config.ai.retry?.retries ?? 2),
        baseDelayMs: Math.max(0, options.config.ai.retry?.baseDelayMs ?? 1000),
        shouldRetry: shouldRetryLlmError,
      },
    )

    const message = response?.choices?.[0]?.message
    const responseUsage =
      response && typeof response === "object" && "usage" in response
        ? (response as { usage?: unknown }).usage
        : undefined
    const responseId = readProviderResponseId(response)
    const previousResponseId = continuationRequest?.previousResponseId
    const promptCacheKey = readResponsesPromptCacheKey(responsesExtraBody)
    if (toolCallbackTasks.length) {
      await Promise.allSettled(toolCallbackTasks)
    }
    return {
      content: typeof message?.content === "string" ? message.content : "",
      toolCalls: message?.tool_calls || [],
      toolTrace,
      usage: normalizeTokenUsage(message?.usage ?? responseUsage),
      responseId,
      responseResumable,
      previousResponseId,
      promptCacheKey,
    }
  } finally {
    if (useTools) {
      await session.disconnectMcp()
    }
  }
}
