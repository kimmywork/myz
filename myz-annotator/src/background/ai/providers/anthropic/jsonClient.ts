import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderMessage,
  ProviderStreamOptions,
  ProviderToolCall,
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

async function parseAnthropicStream(
  response: Response,
  options: ProviderStreamOptions,
): Promise<ProviderChatCompletionResponse> {
  if (!response.body) {
    throw new Error("Empty streaming response body")
  }

  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  let content = ""
  let usage: any = null
  const toolBlocks = new Map<
    number,
    { id: string; name: string; argsText: string }
  >()

  const appendContent = (text: string) => {
    if (!text) return
    content += text
    options.onStreamDelta?.({ content })
  }

  const ensureToolBlock = (index: number) => {
    if (!toolBlocks.has(index)) {
      toolBlocks.set(index, {
        id: `tool-${index + 1}`,
        name: "",
        argsText: "",
      })
    }
    return toolBlocks.get(index)!
  }

  const handlePayload = (payload: any) => {
    const type = typeof payload?.type === "string" ? payload.type : ""
    if (type === "message_start") {
      if (payload?.message?.usage) {
        usage = payload.message.usage
      }
      return
    }
    if (type === "content_block_start") {
      const index = typeof payload?.index === "number" ? payload.index : 0
      const block = payload?.content_block || {}
      if (block.type === "text" && typeof block.text === "string") {
        appendContent(block.text)
      }
      if (block.type === "tool_use") {
        const toolBlock = ensureToolBlock(index)
        if (typeof block.id === "string" && block.id) {
          toolBlock.id = block.id
        }
        if (typeof block.name === "string") {
          toolBlock.name = block.name
        }
        if (block.input && typeof block.input === "object") {
          const keys = Object.keys(block.input)
          if (keys.length) {
            toolBlock.argsText = JSON.stringify(block.input)
          }
        } else if (typeof block.input === "string" && block.input.trim()) {
          toolBlock.argsText = block.input
        }
      }
      return
    }
    if (type === "content_block_delta") {
      const index = typeof payload?.index === "number" ? payload.index : 0
      const delta = payload?.delta || {}
      if (delta.type === "text_delta" && typeof delta.text === "string") {
        appendContent(delta.text)
        return
      }
      if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
        const toolBlock = ensureToolBlock(index)
        toolBlock.argsText += delta.partial_json
      }
      return
    }
    if (payload?.usage) {
      usage = payload.usage
    }
  }

  const reader = response.body.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    buffer = buffer.replace(/\r\n/g, "\n")
    let boundary = buffer.indexOf("\n\n")
    while (boundary >= 0) {
      const rawEvent = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const dataLines = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .filter(Boolean)
      if (dataLines.length) {
        const dataStr = dataLines.join("\n")
        if (dataStr === "[DONE]") {
          boundary = -1
          break
        }
        const parsed = safeJsonParse(dataStr)
        if (parsed) {
          handlePayload(parsed)
        }
      }
      boundary = buffer.indexOf("\n\n")
    }
  }

  const toolCalls: ProviderToolCall[] = Array.from(toolBlocks.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, block]) => {
      let argsText = block.argsText.trim()
      if (!argsText) {
        argsText = "{}"
      } else {
        const parsed = safeJsonParse(argsText)
        if (parsed) {
          argsText = JSON.stringify(parsed)
        }
      }
      return {
        id: block.id || `tool-${index + 1}`,
        type: "function",
        function: {
          name: block.name || "",
          arguments: argsText,
        },
      }
    })

  const message: ProviderMessage = {
    role: "assistant",
    content,
  }
  if (toolCalls.length) {
    message.tool_calls = toolCalls
  }

  return {
    choices: [{ index: 0, message }],
    ...(usage ? { usage } : {}),
  }
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
    options: ProviderStreamOptions = {},
  ): Promise<ProviderChatCompletionResponse> {
    await this.syncHeaders?.()

    const endpoint = buildAnthropicMessagesUrl(resolveValue(this.baseUrl))
    if (!endpoint) {
      throw new Error("API endpoint not configured")
    }

    const payload = {
      ...buildAnthropicPayload(request),
      ...(request.stream ? { stream: true } : {}),
    }
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

    if (request.stream) {
      const contentType = response.headers.get("content-type") || ""
      if (response.body && contentType.includes("text/event-stream")) {
        return parseAnthropicStream(response, options)
      }
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
