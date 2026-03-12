import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderMessage,
  ProviderStreamOptions,
} from "../types"
import { coerceContentToText, normalizeBaseUrl } from "../utils"
import { parseAiRequestHeaders } from "@myz/shared/aiHeaderUtils"
import { isRecord } from "@myz/shared/typeUtils"

type ValueOrGetter<T> = T | (() => T)

function resolveValue<T>(value: ValueOrGetter<T>): T {
  return typeof value === "function" ? (value as () => T)() : value
}

export interface OllamaClientOptions {
  baseUrl: ValueOrGetter<string>
  headers: ValueOrGetter<string>
  syncHeaders?: () => Promise<void>
}

function buildOllamaGenerateUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return ""
  if (normalized.endsWith("/api/generate")) return normalized
  if (normalized.endsWith("/api")) return `${normalized}/generate`
  return `${normalized}/api/generate`
}

function buildOllamaTagsUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return ""
  if (normalized.endsWith("/api/tags")) return normalized
  if (normalized.endsWith("/api")) return `${normalized}/tags`
  return `${normalized}/api/tags`
}

function buildOllamaHeaders(headers: string): Record<string, string> {
  const customHeaders = parseAiRequestHeaders(headers)
  const headerNamesLower = new Set(
    Object.keys(customHeaders).map((key) => key.toLowerCase()),
  )
  const merged: Record<string, string> = {}
  if (!headerNamesLower.has("content-type")) {
    merged["Content-Type"] = "application/json"
  }
  return {
    ...merged,
    ...customHeaders,
  }
}

function buildPromptFromMessages(messages: ProviderMessage[]): {
  system: string
  prompt: string
} {
  const systemParts: string[] = []
  const promptParts: string[] = []

  messages.forEach((message) => {
    if (!message) return
    const text = coerceContentToText(message.content)
    if (message.role === "system" || message.role === "developer") {
      if (text) systemParts.push(text)
      return
    }

    if (message.role === "user") {
      promptParts.push(`User: ${text}`)
      return
    }

    if (message.role === "assistant") {
      promptParts.push(`Assistant: ${text}`)
      if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
        promptParts.push(
          `Assistant tool calls: ${JSON.stringify(
            message.tool_calls.map((call) => ({
              name: call.function?.name,
              arguments: call.function?.arguments,
            })),
          )}`,
        )
      }
      return
    }

    if (message.role === "tool") {
      promptParts.push(`Tool: ${text}`)
    }
  })

  return {
    system: systemParts.join("\n\n"),
    prompt: promptParts.join("\n"),
  }
}

export class OllamaJsonClient implements ChatCompletionClient {
  private baseUrl: ValueOrGetter<string>
  private headers: ValueOrGetter<string>
  private syncHeaders?: () => Promise<void>

  constructor(options: OllamaClientOptions) {
    this.baseUrl = options.baseUrl
    this.headers = options.headers
    this.syncHeaders = options.syncHeaders
  }

  async createCompletion(
    request: ProviderChatCompletionRequest,
    options: ProviderStreamOptions = {},
  ): Promise<ProviderChatCompletionResponse> {
    await this.syncHeaders?.()

    const endpoint = buildOllamaGenerateUrl(resolveValue(this.baseUrl))
    if (!endpoint) {
      throw new Error("API endpoint not configured")
    }

    const { system, prompt } = buildPromptFromMessages(request.messages || [])
    const maxTokens =
      typeof request.max_tokens === "number"
        ? request.max_tokens
        : typeof request.max_completion_tokens === "number"
          ? request.max_completion_tokens
          : undefined
    const payload: Record<string, unknown> = {
      model: request.model,
      prompt,
      stream: Boolean(request.stream),
      ...(system ? { system } : {}),
    }
    if (
      typeof request.temperature === "number" ||
      typeof maxTokens === "number"
    ) {
      payload.options = {
        ...(typeof request.temperature === "number"
          ? { temperature: request.temperature }
          : {}),
        ...(typeof maxTokens === "number" ? { num_predict: maxTokens } : {}),
      }
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildOllamaHeaders(resolveValue(this.headers) || ""),
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
      )
    }

    if (request.stream) {
      if (!response.body) {
        throw new Error("Empty streaming response body")
      }
      const decoder = new TextDecoder("utf-8")
      let buffer = ""
      let content = ""
      let reasoning = ""
      let finalPayload: Record<string, unknown> | null = null
      const reader = response.body.getReader()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let boundary = buffer.indexOf("\n")
        while (boundary >= 0) {
          const line = buffer.slice(0, boundary).trim()
          buffer = buffer.slice(boundary + 1)
          if (line) {
            try {
              const payloadLine = JSON.parse(line) as unknown
              if (
                isRecord(payloadLine) &&
                typeof payloadLine.response === "string"
              ) {
                content += payloadLine.response
                options.onStreamDelta?.({ content, reasoning })
              }
              if (
                isRecord(payloadLine) &&
                typeof payloadLine.thinking === "string"
              ) {
                reasoning += payloadLine.thinking
                options.onStreamDelta?.({ content, reasoning })
              }
              if (isRecord(payloadLine) && payloadLine.done) {
                finalPayload = payloadLine
              }
            } catch {
              // ignore invalid lines
            }
          }
          boundary = buffer.indexOf("\n")
        }
      }

      const message: ProviderMessage = {
        role: "assistant",
        content,
      }
      if (reasoning.trim()) {
        message.reasoning_content = reasoning
      }
      return {
        choices: [
          {
            index: 0,
            message,
          },
        ],
        ...(finalPayload ? finalPayload : {}),
      }
    }

    const data = (await response.json()) as unknown
    const dataRecord = isRecord(data) ? data : {}
    const message: ProviderMessage = {
      role: "assistant",
      content: typeof dataRecord.response === "string" ? dataRecord.response : "",
    }
    if (
      typeof dataRecord.thinking === "string" &&
      dataRecord.thinking.trim()
    ) {
      message.reasoning_content = dataRecord.thinking
    }
    return {
      choices: [
        {
          index: 0,
          message,
        },
      ],
      ...(dataRecord ? dataRecord : {}),
    }
  }
}

export function extractOllamaModels(payload: unknown): string[] {
  const items =
    isRecord(payload) && Array.isArray(payload.models) ? payload.models : []
  return items
    .map((item) =>
      isRecord(item) && typeof item.name === "string" ? item.name : "",
    )
    .filter(
      (name): name is string =>
        typeof name === "string" && name.trim().length > 0,
    )
}

export { buildOllamaTagsUrl, buildOllamaHeaders }
