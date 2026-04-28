import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderMessage,
  ProviderStreamOptions,
  ProviderToolCall,
} from "../types"
import { emitProviderRequestDebug } from "../debug"
import {
  coerceContentToText,
  normalizeBaseUrl,
} from "../utils"
import { getProviderReasoningEffort, getProviderReasoningMode } from "../../runtime/openaiCompatible"
import type { AIProviderSetting } from "../../settings"
import { splitContentAndReasoning } from "../../normalize/message"
import { Mistral } from "@mistralai/mistralai"
import { parseAiRequestHeaders } from "@myz/shared/aiHeaderUtils"
import { isRecord } from "@myz/shared/typeUtils"

type ValueOrGetter<T> = T | (() => T)

function resolveValue<T>(value: ValueOrGetter<T>): T {
  return typeof value === "function" ? (value as () => T)() : value
}

export interface MistralClientOptions {
  baseUrl: ValueOrGetter<string>
  apiKey: ValueOrGetter<string>
  headers: ValueOrGetter<string>
  provider?: Pick<
    AIProviderSetting,
    "reasoningMode" | "reasoningEffort" | "reasoningBudget"
  >
  syncHeaders?: () => Promise<void>
}

function buildMistralModelsUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return ""
  if (normalized.endsWith("/models")) return normalized
  if (normalized.endsWith("/v1")) return `${normalized}/models`
  if (normalized.includes("/v1/")) {
    return `${normalized.replace(/\/v1\/.*$/, "/v1")}/models`
  }
  return `${normalized}/v1/models`
}

function buildMistralSdkBaseUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return ""
  return normalized.replace(/\/v1(?:\/.*)?$/, "")
}

function buildMistralHeaders(headers: string) {
  return parseAiRequestHeaders(headers)
}

function hasAuthorizationHeader(headers: Record<string, string>) {
  return Object.keys(headers).some((key) => key.toLowerCase() === "authorization")
}

export function createMistralSdkClient(options: {
  baseUrl: string
  apiKey: string
  headers: string
}) {
  const customHeaders = buildMistralHeaders(options.headers || "")
  return new Mistral({
    apiKey: hasAuthorizationHeader(customHeaders)
      ? undefined
      : options.apiKey || undefined,
    serverURL: buildMistralSdkBaseUrl(options.baseUrl),
  })
}

function toMistralContent(content: ProviderMessage["content"]) {
  if (typeof content === "string") {
    return content
  }
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => {
      if (!isRecord(part)) return null
      if (part.type === "text" && typeof part.text === "string") {
        return {
          type: "text",
          text: part.text,
        }
      }
      if (
        part.type === "image_url" &&
        isRecord(part.image_url) &&
        typeof part.image_url.url === "string"
      ) {
        return {
          type: "image_url",
          imageUrl: part.image_url.url,
        }
      }
      return null
    })
    .filter(
      (
        part,
      ): part is { type: "text"; text: string } | {
        type: "image_url"
        imageUrl: string
      } => Boolean(part),
    )
}

function toMistralMessages(messages: ProviderMessage[]) {
  return messages
    .map((message) => {
      if (!message) return null
      if (message.role === "system" || message.role === "developer") {
        return {
          role: "system" as const,
          content: toMistralContent(message.content),
        }
      }
      if (message.role === "user") {
        return {
          role: "user" as const,
          content: toMistralContent(message.content),
        }
      }
      if (message.role === "tool") {
        const toolName =
          typeof message.name === "string"
            ? message.name
            : isRecord(message.metadata) && typeof message.metadata.toolName === "string"
              ? message.metadata.toolName
              : undefined
        return {
          role: "tool" as const,
          content:
            typeof message.content === "string"
              ? message.content
              : coerceContentToText(message.content),
          toolCallId: message.tool_call_id || undefined,
          ...(toolName ? { name: toolName } : {}),
        }
      }

      const content = toMistralContent(message.content)
      const toolCalls = Array.isArray(message.tool_calls)
        ? message.tool_calls.map((toolCall, index) => ({
            id: toolCall.id || `tool-${index + 1}`,
            type: toolCall.type || "function",
            function: {
              name: toolCall.function?.name || "",
              arguments: toolCall.function?.arguments || "{}",
            },
            index,
          }))
        : undefined
      return {
        role: "assistant" as const,
        content,
        ...(toolCalls?.length ? { toolCalls } : {}),
      }
    })
    .filter(Boolean)
}

function normalizeToolChoice(choice: unknown) {
  if (!choice) return undefined
  if (choice === "auto" || choice === "none" || choice === "required") {
    return choice
  }
  if (!isRecord(choice)) return undefined
  const name =
    (isRecord(choice.function) ? choice.function.name : undefined) || choice.name
  return typeof name === "string" && name
    ? {
        type: "function",
        function: { name },
      }
    : undefined
}

function normalizeTools(tools: ProviderChatCompletionRequest["tools"]) {
  if (!Array.isArray(tools)) return undefined
  return tools
    .map((tool) => {
      if (tool?.type !== "function" || !tool.function?.name) return null
      return {
        type: "function" as const,
        function: {
          name: tool.function.name,
          description: tool.function.description || "",
          parameters: tool.function.parameters || {},
        },
      }
    })
    .filter(Boolean)
}

function normalizeResponseFormat(
  responseFormat: ProviderChatCompletionRequest["response_format"],
) {
  if (!responseFormat) return undefined
  if (responseFormat === "text") {
    return { type: "text" as const }
  }
  return responseFormat
}

function buildMistralPayload(
  request: ProviderChatCompletionRequest,
  provider: MistralClientOptions["provider"],
  options?: ProviderStreamOptions,
) {
  const payload: Record<string, unknown> = {
    model: request.model,
    messages: toMistralMessages(request.messages),
  }
  if (typeof request.temperature === "number") {
    payload.temperature = request.temperature
  }
  if (typeof request.max_tokens === "number") {
    payload.maxTokens = request.max_tokens
  } else if (typeof request.max_completion_tokens === "number") {
    payload.maxTokens = request.max_completion_tokens
  }
  const tools = normalizeTools(request.tools)
  if (tools?.length && request.tool_choice !== "none") {
    payload.tools = tools
  }
  const toolChoice = normalizeToolChoice(request.tool_choice)
  if (toolChoice && request.tool_choice !== "none") {
    payload.toolChoice = toolChoice
  }
  if (typeof request.parallel_tool_calls === "boolean") {
    payload.parallelToolCalls = request.parallel_tool_calls
  }
  const responseFormat = normalizeResponseFormat(request.response_format)
  if (responseFormat) {
    payload.responseFormat = responseFormat
  }

  const reasoningMode = provider
    ? getProviderReasoningMode(provider, Boolean(options?.enableReasoning))
    : options?.enableReasoning
      ? "enabled"
      : "provider_default"
  const reasoningEffort = provider
    ? getProviderReasoningEffort(provider, request.reasoning_effort)
    : request.reasoning_effort
  if (reasoningMode === "disabled") {
    payload.reasoningEffort = "none"
  } else if (reasoningEffort || reasoningMode === "enabled") {
    payload.reasoningEffort = "high"
  }

  return payload
}

function normalizeMistralToolCalls(toolCalls: unknown) {
  if (!Array.isArray(toolCalls)) return undefined
  const normalized = toolCalls
    .map((toolCall, index) => {
      if (!isRecord(toolCall) || !isRecord(toolCall.function)) return null
      return {
        id:
          typeof toolCall.id === "string" && toolCall.id
            ? toolCall.id
            : `tool-${index + 1}`,
        type: "function" as const,
        function: {
          name:
            typeof toolCall.function.name === "string"
              ? toolCall.function.name
              : "",
          arguments:
            typeof toolCall.function.arguments === "string"
              ? toolCall.function.arguments
              : "{}",
        },
      }
    })
    .filter((toolCall): toolCall is ProviderToolCall => Boolean(toolCall))
  return normalized.length ? normalized : undefined
}

function normalizeMistralMessage(message: unknown): ProviderMessage {
  if (!isRecord(message)) {
    return { role: "assistant", content: "" }
  }

  const toolCalls = normalizeMistralToolCalls(message.toolCalls || message.tool_calls)

  return {
    role: "assistant",
    content:
      typeof message.content === "string" || Array.isArray(message.content)
        ? message.content
        : "",
    ...(toolCalls ? { tool_calls: toolCalls } : {}),
  }
}

function mergeToolCallArguments(current: string, incoming: string) {
  if (!incoming) return current
  if (!current) return incoming
  if (current === incoming) return current
  if (incoming.startsWith(current)) return incoming
  if (current.startsWith(incoming)) return current
  return current + incoming
}

async function consumeMistralStream(
  stream: AsyncIterable<unknown>,
  options: ProviderStreamOptions,
) {
  let content = ""
  let reasoning = ""
  let finishReason: string | undefined
  let usage: unknown
  const toolCalls = new Map<string, ProviderToolCall>()

  for await (const event of stream) {
    const payload =
      isRecord(event) && isRecord(event.data) ? event.data : isRecord(event) ? event : null
    if (!payload) continue

    if (payload.usage) {
      usage = payload.usage
    }

    const choice =
      Array.isArray(payload.choices) && isRecord(payload.choices[0])
        ? payload.choices[0]
        : null
    if (!choice) continue
    if (typeof choice.finishReason === "string") {
      finishReason = choice.finishReason
    }

    const delta = isRecord(choice.delta) ? choice.delta : null
    if (!delta) continue

    const { text: deltaText, reasoning: deltaReasoning } =
      splitContentAndReasoning(delta.content)
    if (deltaText) {
      content += deltaText
    }
    if (deltaReasoning) {
      reasoning += deltaReasoning
    }
    if (deltaText || deltaReasoning) {
      await options.onStreamDelta?.({
        content: deltaText,
        reasoning: deltaReasoning,
      })
    }

    if (Array.isArray(delta.toolCalls)) {
      delta.toolCalls.forEach((toolCall, index) => {
        if (!isRecord(toolCall) || !isRecord(toolCall.function)) return
        const id =
          typeof toolCall.id === "string" && toolCall.id
            ? toolCall.id
            : `tool-${index + 1}`
        const existing = toolCalls.get(id) || {
          id,
          type: "function" as const,
          function: {
            name:
              typeof toolCall.function.name === "string"
                ? toolCall.function.name
                : "",
            arguments: "",
          },
        }
        existing.function.name =
          typeof toolCall.function.name === "string"
            ? toolCall.function.name
            : existing.function.name
        existing.function.arguments = mergeToolCallArguments(
          existing.function.arguments || "",
          typeof toolCall.function.arguments === "string"
            ? toolCall.function.arguments
            : "",
        )
        toolCalls.set(id, existing)
      })
    }
  }

  const message: ProviderMessage = {
    role: "assistant",
    content,
    ...(toolCalls.size ? { tool_calls: [...toolCalls.values()] } : {}),
    ...(reasoning ? { reasoning_content: reasoning } : {}),
  }

  return {
    choices: [
      {
        index: 0,
        finish_reason: finishReason,
        message,
      },
    ],
    ...(usage ? { usage } : {}),
  } satisfies ProviderChatCompletionResponse
}

export function extractMistralModels(payload: unknown): string[] {
  const items =
    isRecord(payload) && Array.isArray(payload.data) ? payload.data : []
  return items
    .map((item) =>
      isRecord(item) && typeof item.id === "string" ? item.id.trim() : "",
    )
    .filter(Boolean)
}

export class MistralJsonClient implements ChatCompletionClient {
  private baseUrl: ValueOrGetter<string>
  private apiKey: ValueOrGetter<string>
  private headers: ValueOrGetter<string>
  private provider?: MistralClientOptions["provider"]
  private syncHeaders?: () => Promise<void>

  constructor(options: MistralClientOptions) {
    this.baseUrl = options.baseUrl
    this.apiKey = options.apiKey
    this.headers = options.headers
    this.provider = options.provider
    this.syncHeaders = options.syncHeaders
  }

  async createCompletion(
    request: ProviderChatCompletionRequest,
    options: ProviderStreamOptions = {},
  ): Promise<ProviderChatCompletionResponse> {
    await this.syncHeaders?.()

    const baseUrl = resolveValue(this.baseUrl)
    if (!baseUrl) {
      throw new Error("Base URL is required")
    }
    const apiKey = resolveValue(this.apiKey)
    const headers = resolveValue(this.headers)
    const payload = buildMistralPayload(request, this.provider, options)
    const client = createMistralSdkClient({
      baseUrl,
      apiKey,
      headers,
    })
    const requestOptions = {
      serverURL: buildMistralSdkBaseUrl(baseUrl),
      headers: buildMistralHeaders(headers),
    }

    await emitProviderRequestDebug(options, {
      endpoint: `${normalizeBaseUrl(baseUrl)}/chat/completions`,
      transport: request.stream ? "sse" : "json",
      body: payload,
    })

    if (request.stream) {
      const stream = await client.chat.stream(payload as never, requestOptions)
      return consumeMistralStream(stream as AsyncIterable<unknown>, options)
    }

    const response = await client.chat.complete(payload as never, requestOptions)
    const message = normalizeMistralMessage(
      Array.isArray(response.choices) ? response.choices[0]?.message : undefined,
    )
    return {
      id: (response as { id?: string }).id,
      choices: [
        {
          index: 0,
          finish_reason:
            Array.isArray(response.choices) &&
            response.choices[0] &&
            "finishReason" in response.choices[0]
              ? (response.choices[0] as { finishReason?: string }).finishReason
              : undefined,
          message,
        },
      ],
      ...(isRecord(response.usage) ? { usage: response.usage } : {}),
    }
  }
}

export { buildMistralHeaders, buildMistralModelsUrl, buildMistralSdkBaseUrl }
