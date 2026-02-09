import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderMessage,
  ProviderStreamOptions,
} from "../types.js"
import { parseAiRequestHeaders } from "@/shared/aiHeaderUtils.js"
import { coerceContentToText, normalizeBaseUrl, parseDataUrl, safeJsonParse } from "../utils.js"

type ValueOrGetter<T> = T | (() => T)

function resolveValue<T>(value: ValueOrGetter<T>): T {
  return typeof value === "function" ? (value as () => T)() : value
}

export interface AnthropicClientOptions {
  baseUrl: ValueOrGetter<string>
  apiKey: ValueOrGetter<string>
  headers: ValueOrGetter<string>
  syncHeaders?: () => Promise<void>
}

function buildAnthropicMessagesUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return ""
  if (normalized.endsWith("/messages")) return normalized
  if (normalized.endsWith("/v1")) return `${normalized}/messages`
  if (normalized.includes("/v1/")) return `${normalized.replace(/\/v1\/.*$/, "/v1")}/messages`
  return `${normalized}/v1/messages`
}

function buildAnthropicModelsUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return ""
  if (normalized.endsWith("/models")) return normalized
  if (normalized.endsWith("/v1")) return `${normalized}/models`
  if (normalized.includes("/v1/")) return `${normalized.replace(/\/v1\/.*$/, "/v1")}/models`
  return `${normalized}/v1/models`
}

function buildAnthropicHeaders(apiKey: string, headers: string): Record<string, string> {
  const customHeaders = parseAiRequestHeaders(headers)
  const headerNamesLower = new Set(
    Object.keys(customHeaders).map((key) => key.toLowerCase()),
  )
  const merged: Record<string, string> = {}

  if (!headerNamesLower.has("content-type")) {
    merged["Content-Type"] = "application/json"
  }
  if (apiKey && !headerNamesLower.has("x-api-key") && !headerNamesLower.has("authorization")) {
    merged["x-api-key"] = apiKey
  }
  if (!headerNamesLower.has("anthropic-version")) {
    merged["anthropic-version"] = "2023-06-01"
  }

  return {
    ...merged,
    ...customHeaders,
  }
}

function toAnthropicContentBlocks(content: ProviderMessage["content"]): any[] {
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : []
  }
  if (!Array.isArray(content)) return []

  return content
    .map((part: any) => {
      if (!part) return null
      if (part.type === "text" && typeof part.text === "string") {
        return { type: "text", text: part.text }
      }
      if (part.type === "image_url" && part.image_url?.url) {
        const parsed = parseDataUrl(part.image_url.url)
        if (!parsed) {
          return { type: "text", text: `[Image] ${part.image_url.url}` }
        }
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: parsed.mimeType,
            data: parsed.data,
          },
        }
      }
      return null
    })
    .filter(Boolean)
}

function normalizeAnthropicToolChoice(choice: any) {
  if (!choice) return undefined
  if (typeof choice === "string") {
    if (choice === "required") return { type: "any" }
    if (choice === "auto") return { type: "auto" }
    return undefined
  }
  const name = choice?.function?.name || choice?.name
  if (name) {
    return { type: "tool", name }
  }
  return undefined
}

function buildAnthropicPayload(request: ProviderChatCompletionRequest): any {
  const messages: any[] = []
  const systemParts: string[] = []

  request.messages.forEach((message) => {
    if (!message) return
    if (message.role === "system" || message.role === "developer") {
      const text = coerceContentToText(message.content)
      if (text) systemParts.push(text)
      return
    }

    if (message.role === "tool") {
      const toolResult = typeof message.content === "string"
        ? message.content
        : coerceContentToText(message.content)
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.tool_call_id || "",
            content: toolResult || "",
          },
        ],
      })
      return
    }

    if (message.role === "assistant") {
      const blocks: any[] = []
      const textBlocks = toAnthropicContentBlocks(message.content)
      if (textBlocks.length) blocks.push(...textBlocks)
      if (Array.isArray(message.tool_calls)) {
        message.tool_calls.forEach((toolCall) => {
          if (!toolCall?.function?.name) return
          const input = safeJsonParse(toolCall.function.arguments) ?? {
            _raw: toolCall.function.arguments,
          }
          blocks.push({
            type: "tool_use",
            id: toolCall.id || "",
            name: toolCall.function.name,
            input,
          })
        })
      }
      if (blocks.length) {
        messages.push({
          role: "assistant",
          content: blocks,
        })
      }
      return
    }

    if (message.role === "user") {
      const blocks = toAnthropicContentBlocks(message.content)
      if (!blocks.length) return
      messages.push({
        role: "user",
        content: blocks,
      })
    }
  })

  const tools = Array.isArray(request.tools)
    ? request.tools
        .map((tool) => ({
          name: tool.function?.name,
          description: tool.function?.description,
          input_schema: tool.function?.parameters,
        }))
        .filter((tool) => tool.name)
    : undefined
  const omitTools = request.tool_choice === "none"
  const toolChoice = normalizeAnthropicToolChoice(request.tool_choice)

  const maxTokens =
    typeof request.max_tokens === "number"
      ? request.max_tokens
      : typeof request.max_completion_tokens === "number"
        ? request.max_completion_tokens
        : undefined

  return {
    model: request.model,
    messages,
    ...(systemParts.length ? { system: systemParts.join("\n\n") } : {}),
    ...(typeof request.temperature === "number" ? { temperature: request.temperature } : {}),
    ...(typeof maxTokens === "number" ? { max_tokens: maxTokens } : {}),
    ...(tools && tools.length && !omitTools ? { tools } : {}),
    ...(toolChoice && !omitTools ? { tool_choice: toolChoice } : {}),
  }
}

function extractAnthropicMessage(payload: any): ProviderMessage {
  const blocks = Array.isArray(payload?.content) ? payload.content : []
  const textParts: string[] = []
  const toolCalls: any[] = []

  blocks.forEach((block: any, index: number) => {
    if (!block) return
    if (block.type === "text" && typeof block.text === "string") {
      textParts.push(block.text)
      return
    }
    if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id || `tool-${index + 1}`,
        type: "function",
        function: {
          name: block.name || "unknown",
          arguments: JSON.stringify(block.input || {}),
        },
      })
    }
  })

  const message: ProviderMessage = {
    role: "assistant",
    content: textParts.join("\n").trim(),
  }
  if (toolCalls.length) {
    message.tool_calls = toolCalls
  }
  return message
}

export class AnthropicJsonClient implements ChatCompletionClient {
  private baseUrl: ValueOrGetter<string>
  private apiKey: ValueOrGetter<string>
  private headers: ValueOrGetter<string>
  private syncHeaders?: () => Promise<void>

  constructor(options: AnthropicClientOptions) {
    this.baseUrl = options.baseUrl
    this.apiKey = options.apiKey
    this.headers = options.headers
    this.syncHeaders = options.syncHeaders
  }

  async createCompletion(
    request: ProviderChatCompletionRequest,
    _options: ProviderStreamOptions = {},
  ): Promise<ProviderChatCompletionResponse> {
    await this.syncHeaders?.()

    const endpoint = buildAnthropicMessagesUrl(resolveValue(this.baseUrl))
    if (!endpoint) {
      throw new Error("API endpoint not configured")
    }

    const payload = buildAnthropicPayload(request)
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildAnthropicHeaders(
        resolveValue(this.apiKey),
        resolveValue(this.headers) || "",
      ),
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
      )
    }

    const data = await response.json()
    const message = extractAnthropicMessage(data)
    return {
      choices: [
        {
          index: 0,
          message,
        },
      ],
      ...data,
    }
  }
}

export function extractAnthropicModels(payload: any): string[] {
  const items = Array.isArray(payload?.data) ? payload.data : []
  return items
    .map((item: any) => item?.id)
    .filter(
      (id: any): id is string => typeof id === "string" && id.trim().length > 0,
    )
}

export { buildAnthropicModelsUrl, buildAnthropicHeaders }
