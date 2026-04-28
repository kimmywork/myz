import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderMessage,
  ProviderToolCall,
  ProviderStreamOptions,
} from "../types"
import { createOpenAISdkClient } from "./sdkClient"
import {
  normalizeReasoningChunk,
  splitContentAndReasoning,
} from "../../normalize/message"
import { extractGeminiThoughtSegments } from "../../vendors/googleGemini"
import { isRecord } from "@myz/shared/typeUtils"

type ValueOrGetter<T> = T | (() => T)

function resolveValue<T>(value: ValueOrGetter<T>): T {
  return typeof value === "function" ? (value as () => T)() : value
}

type StreamToolCallDelta = Partial<ProviderToolCall> & { index?: number }
type StreamDelta = {
  content?: unknown
  reasoning?: unknown
  reasoning_content?: unknown
  tool_calls?: StreamToolCallDelta[]
}

export interface OpenAICompatibleJsonClientOptions {
  endpoint: ValueOrGetter<string>
  buildHeaders: ValueOrGetter<Record<string, string>>
  syncHeaders?: () => Promise<void>
  streamingEnabled?: boolean
}

export class OpenAICompatibleJsonClient implements ChatCompletionClient {
  private endpoint: ValueOrGetter<string>
  private buildHeaders: ValueOrGetter<Record<string, string>>
  private syncHeaders?: () => Promise<void>
  private streamingEnabled: boolean

  constructor(options: OpenAICompatibleJsonClientOptions) {
    this.endpoint = options.endpoint
    this.buildHeaders = options.buildHeaders
    this.syncHeaders = options.syncHeaders
    this.streamingEnabled = options.streamingEnabled !== false
  }

  async createCompletion(
    request: ProviderChatCompletionRequest,
    options: ProviderStreamOptions = {},
  ): Promise<ProviderChatCompletionResponse> {
    await this.syncHeaders?.()

    const endpoint = resolveValue(this.endpoint)
    if (!endpoint) {
      throw new Error("API endpoint not configured")
    }

    const headers = resolveValue(this.buildHeaders) || {}
    const authorizationHeader = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === "authorization",
    )?.[1]
    const apiKey =
      typeof authorizationHeader === "string" &&
      authorizationHeader.toLowerCase().startsWith("bearer ")
        ? authorizationHeader.slice(7).trim()
        : ""
    const normalizedRequest = {
      ...request,
      messages: shouldUseDeveloperRole(request?.model)
        ? request.messages.map((message) =>
            message.role === "system"
              ? { ...message, role: "developer" }
              : message,
          )
        : request.messages,
    }
    const requestPayload = {
      ...normalizedRequest,
      stream: Boolean(request.stream && this.streamingEnabled),
    }
    const client = createOpenAISdkClient({
      baseURL: endpoint.replace(/\/chat\/completions\/?$/, ""),
      apiKey,
      headers: serializeHeadersForSdk(headers),
      requestOptions: options,
    })

    if (requestPayload.stream) {
      const stream = await client.chat.completions.create({
        ...requestPayload,
        stream: true,
        stream_options: {
          ...(isRecord(requestPayload.stream_options)
            ? requestPayload.stream_options
            : {}),
          include_usage: true,
        },
      } as any)
      return consumeChatCompletionStream(
        stream as unknown as AsyncIterable<unknown>,
        request.model,
        options,
      )
    }

    return (await client.chat.completions.create(
      requestPayload as any,
    )) as unknown as ProviderChatCompletionResponse
  }
}

function serializeHeadersForSdk(headers: Record<string, string>) {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
}

function isGeminiModel(model: unknown) {
  return typeof model === "string" && /^gemini/i.test(model)
}

function createDefaultAccumulator() {
  let content = ""
  let reasoning = ""
  const toolCalls: ProviderToolCall[] = []

  const ensureToolCallSlot = (index: number, partial: StreamToolCallDelta) => {
    if (!toolCalls[index]) {
      toolCalls[index] = {
        id: partial?.id || `tool-${index + 1}`,
        type: "function",
        function: {
          name: partial?.function?.name || "",
          arguments: "",
        },
        ...(partial?.extra_content
          ? { extra_content: partial.extra_content }
          : {}),
      }
    }

    const target = toolCalls[index]
    if (partial?.id) {
      target.id = partial.id
    }
    if (partial?.function?.name) {
      target.function.name = partial.function.name
    }
    if (partial?.function?.arguments) {
      target.function.arguments =
        (target.function.arguments || "") + partial.function.arguments
    }
    if (partial?.extra_content) {
      target.extra_content = {
        ...(target.extra_content || {}),
        ...partial.extra_content,
      }
    }
    const thoughtSignature =
      typeof partial?.thought_signature === "string"
        ? partial.thought_signature
        : isRecord(partial?.extra_content) &&
            isRecord(partial?.extra_content?.google) &&
            typeof partial.extra_content.google.thought_signature === "string"
          ? partial.extra_content.google.thought_signature
          : undefined
    if (thoughtSignature) {
      target.extra_content = {
        ...(target.extra_content || {}),
        google: {
          ...(isRecord(target.extra_content?.google)
            ? target.extra_content?.google
            : {}),
          thought_signature: thoughtSignature,
        },
      }
    }
  }

  return {
    pushDelta(delta: StreamDelta) {
      const { text: deltaText, reasoning: reasoningFromContent } =
        splitContentAndReasoning(delta.content)
      if (deltaText) {
        content += deltaText
      }
      const reasoningParts: string[] = []
      if (reasoningFromContent) reasoningParts.push(reasoningFromContent)
      ;[delta.reasoning_content, delta.reasoning].forEach((field) => {
        const normalized = normalizeReasoningChunk(field)
        if (normalized) reasoningParts.push(normalized)
      })
      if (reasoningParts.length) {
        reasoning += reasoningParts.join("")
      }
      if (Array.isArray(delta.tool_calls)) {
        delta.tool_calls.forEach((callDelta, idx) => {
          const targetIndex =
            typeof callDelta.index === "number" ? callDelta.index : idx
          ensureToolCallSlot(targetIndex, callDelta)
        })
      }
    },
    getContent() {
      return content
    },
    getReasoning() {
      return reasoning
    },
    getToolCalls() {
      return toolCalls.filter(Boolean)
    },
  }
}

function createGeminiAccumulator() {
  let visible = ""
  let thought = ""
  const base = createDefaultAccumulator()
  return {
    pushDelta(delta: StreamDelta) {
      const { text: deltaText, reasoning: reasoningFromContent } =
        splitContentAndReasoning(delta.content)
      if (deltaText) {
        visible += deltaText
        const extracted = extractGeminiThoughtSegments(visible)
        visible = extracted.buffer
        if (extracted.thought) {
          thought = [thought, extracted.thought].filter(Boolean).join("\n\n")
        }
      }
      const reasoningParts: string[] = []
      if (reasoningFromContent) reasoningParts.push(reasoningFromContent)
      ;[delta.reasoning_content, delta.reasoning].forEach((field) => {
        const normalized = normalizeReasoningChunk(field)
        if (normalized) reasoningParts.push(normalized)
      })
      if (reasoningParts.length) {
        thought = [thought, reasoningParts.join("")].filter(Boolean).join("")
      }
      if (Array.isArray(delta.tool_calls)) {
        base.pushDelta({ tool_calls: delta.tool_calls })
      }
    },
    getContent() {
      return visible
    },
    getReasoning() {
      return thought
    },
    getToolCalls() {
      return base.getToolCalls()
    },
  }
}

function normalizeChunkDelta(chunk: unknown): StreamDelta | null {
  const choice =
    isRecord(chunk) && Array.isArray(chunk.choices) && isRecord(chunk.choices[0])
      ? chunk.choices[0]
      : null
  const delta = choice && isRecord(choice.delta) ? choice.delta : null
  if (!delta) return null
  return {
    content: delta.content,
    reasoning: delta.reasoning,
    reasoning_content: delta.reasoning_content,
    tool_calls: Array.isArray(delta.tool_calls)
      ? (delta.tool_calls as StreamToolCallDelta[])
      : undefined,
  }
}

async function consumeChatCompletionStream(
  stream: AsyncIterable<unknown>,
  model: unknown,
  options: ProviderStreamOptions,
): Promise<ProviderChatCompletionResponse> {
  const accumulator = isGeminiModel(model)
    ? createGeminiAccumulator()
    : createDefaultAccumulator()

  for await (const event of stream) {
    const delta = normalizeChunkDelta(event)
    if (!delta) continue
    accumulator.pushDelta(delta)
    options.onStreamDelta?.({
      content: accumulator.getContent(),
      reasoning: accumulator.getReasoning(),
    })
  }

  const message: ProviderMessage = {
    role: "assistant",
    content: accumulator.getContent(),
  }
  if (accumulator.getReasoning().trim()) {
    message.reasoning_content = accumulator.getReasoning()
  }
  const toolCalls = accumulator.getToolCalls()
  if (toolCalls.length) {
    message.tool_calls = toolCalls
  }
  return {
    choices: [{ index: 0, message }],
  }
}

export function shouldUseDeveloperRole(model: unknown): boolean {
  const raw = typeof model === "string" ? model.trim().toLowerCase() : ""
  if (!raw.startsWith("gpt-")) return false
  if (raw.startsWith("gpt-o1")) return true
  const rest = raw.slice(4)
  const digitMatch = rest.match(/\d/)
  if (!digitMatch) return false
  const digit = Number(digitMatch[0])
  if (!Number.isFinite(digit)) return false
  return digit >= 4
}
