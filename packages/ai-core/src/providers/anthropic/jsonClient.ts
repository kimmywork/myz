import Anthropic from "@anthropic-ai/sdk"
import { parseAiRequestHeaders } from "@myz/shared/aiHeaderUtils"
import type { JsonRecord } from "@myz/shared/typeUtils"
import { isJsonRecord, isRecord, toJsonRecord } from "@myz/shared/typeUtils"
import { emitProviderRequestDebug } from "../debug"
import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderMessage,
  ProviderStreamOptions,
  ProviderToolCall,
} from "../types"
import {
  coerceContentToText,
  normalizeBaseUrl,
  parseDataUrl,
  safeJsonParse,
} from "../utils"

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
  if (normalized.includes("/v1/"))
    return `${normalized.replace(/\/v1\/.*$/, "/v1")}/messages`
  return `${normalized}/v1/messages`
}

function buildAnthropicModelsUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return ""
  if (normalized.endsWith("/models")) return normalized
  if (normalized.endsWith("/v1")) return `${normalized}/models`
  if (normalized.includes("/v1/"))
    return `${normalized.replace(/\/v1\/.*$/, "/v1")}/models`
  return `${normalized}/v1/models`
}

function buildAnthropicHeaders(
  apiKey: string,
  headers: string,
): Record<string, string> {
  const customHeaders = parseAiRequestHeaders(headers)
  const headerNamesLower = new Set(
    Object.keys(customHeaders).map((key) => key.toLowerCase()),
  )
  const merged: Record<string, string> = {}

  if (!headerNamesLower.has("content-type")) {
    merged["Content-Type"] = "application/json"
  }
  if (
    apiKey &&
    !headerNamesLower.has("x-api-key") &&
    !headerNamesLower.has("authorization")
  ) {
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

function toAnthropicContentBlocks(
  content: ProviderMessage["content"],
): JsonRecord[] {
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : []
  }
  if (!Array.isArray(content)) return []

  return content
    .map((part) => {
      if (!isRecord(part)) return null
      if (part.type === "text" && typeof part.text === "string") {
        const block: JsonRecord = { type: "text", text: part.text }
        return block
      }
      if (
        part.type === "image_url" &&
        isRecord(part.image_url) &&
        part.image_url.url
      ) {
        const parsed = parseDataUrl(String(part.image_url.url))
        if (!parsed) {
          const block: JsonRecord = {
            type: "text",
            text: `[Image] ${String(part.image_url.url)}`,
          }
          return block
        }
        const source: JsonRecord = {
          type: "base64",
          media_type: parsed.mimeType,
          data: parsed.data,
        }
        return {
          type: "image",
          source,
        }
      }
      return null
    })
    .filter((item): item is JsonRecord => Boolean(item))
}

function normalizeAnthropicToolChoice(choice: unknown): JsonRecord | undefined {
  if (!choice) return undefined
  if (typeof choice === "string") {
    if (choice === "required") return { type: "any" }
    if (choice === "auto") return { type: "auto" }
    return undefined
  }
  if (!isRecord(choice)) return undefined
  const rawName =
    (isRecord(choice.function) ? choice.function.name : undefined) ||
    choice.name
  const name = typeof rawName === "string" ? rawName : ""
  if (name) {
    return { type: "tool", name }
  }
  return undefined
}

function buildAnthropicPayload(
  request: ProviderChatCompletionRequest,
): JsonRecord {
  const messages: JsonRecord[] = []
  const systemParts: string[] = []

  request.messages.forEach((message) => {
    if (!message) return
    if (message.role === "system" || message.role === "developer") {
      const text = coerceContentToText(message.content)
      if (text) systemParts.push(text)
      return
    }

    if (message.role === "tool") {
      const toolResult =
        typeof message.content === "string"
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
      const blocks: JsonRecord[] = []
      const textBlocks = toAnthropicContentBlocks(message.content)
      if (textBlocks.length) blocks.push(...textBlocks)
      if (Array.isArray(message.tool_calls)) {
        message.tool_calls.forEach((toolCall) => {
          if (!toolCall?.function?.name) return
          const parsedInput = safeJsonParse(toolCall.function.arguments)
          const input = toJsonRecord(parsedInput, {
            _raw: toolCall.function.arguments,
          })
          const toolBlock: JsonRecord = {
            type: "tool_use",
            id: toolCall.id || "",
            name: toolCall.function.name,
            input,
          }
          blocks.push(toolBlock)
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
        .map((tool) => {
          const entry: JsonRecord = {
            name: tool.function?.name || "",
            description: tool.function?.description || "",
            input_schema: tool.function?.parameters || {},
          }
          return entry
        })
        .filter((tool) => typeof tool.name === "string" && tool.name)
    : undefined
  const omitTools = request.tool_choice === "none"
  const toolChoice = normalizeAnthropicToolChoice(request.tool_choice)

  const maxTokens =
    typeof request.max_tokens === "number"
      ? request.max_tokens
      : typeof request.max_completion_tokens === "number"
        ? request.max_completion_tokens
        : undefined

  const payload: JsonRecord = {
    model: request.model,
    messages,
  }
  if (systemParts.length) {
    payload.system = systemParts.join("\n\n")
  }
  if (typeof request.temperature === "number") {
    payload.temperature = request.temperature
  }
  if (typeof maxTokens === "number") {
    payload.max_tokens = maxTokens
  }
  if (tools && tools.length && !omitTools) {
    payload.tools = tools
  }
  if (toolChoice && !omitTools) {
    payload.tool_choice = toolChoice
  }
  return payload
}

function extractAnthropicMessage(payload: unknown): ProviderMessage {
  const blocks =
    isRecord(payload) && Array.isArray(payload.content) ? payload.content : []
  const textParts: string[] = []
  const toolCalls: ProviderToolCall[] = []

  blocks.forEach((block, index: number) => {
    if (!isRecord(block)) return
    if (block.type === "text" && typeof block.text === "string") {
      textParts.push(block.text)
      return
    }
    if (block.type === "tool_use") {
      const id =
        typeof block.id === "string" && block.id
          ? block.id
          : `tool-${index + 1}`
      const name =
        typeof block.name === "string" && block.name ? block.name : "unknown"
      const argsInput = isJsonRecord(block.input)
        ? block.input
        : toJsonRecord(block.input, {})
      toolCalls.push({
        id,
        type: "function",
        function: {
          name,
          arguments: JSON.stringify(argsInput || {}),
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

class BrowserAnthropic extends Anthropic {
  protected override validateHeaders() {
    return
  }

  protected override async authHeaders() {
    return undefined
  }
}

function createAnthropicSdkClient(options: {
  baseUrl: string
  apiKey: string
  headers: string
  requestOptions?: ProviderStreamOptions
}) {
  return new BrowserAnthropic({
    apiKey: options.apiKey || null,
    authToken: null,
    baseURL: options.baseUrl,
    defaultHeaders: buildAnthropicHeaders(options.apiKey, options.headers || ""),
    dangerouslyAllowBrowser: true,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const endpoint =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : typeof Request !== "undefined" && input instanceof Request
              ? input.url
              : String(input)
      const rawBody = typeof init?.body === "string" ? init.body : init?.body
      let parsedBody: unknown = rawBody ?? null
      if (typeof rawBody === "string") {
        try {
          parsedBody = JSON.parse(rawBody)
        } catch {
          parsedBody = rawBody
        }
      }
      await emitProviderRequestDebug(options.requestOptions, {
        endpoint,
        transport:
          parsedBody &&
          typeof parsedBody === "object" &&
          "stream" in (parsedBody as Record<string, unknown>) &&
          (parsedBody as Record<string, unknown>).stream === true
            ? "sse"
            : "json",
        body: parsedBody,
      })
      return fetch(input, init)
    },
  })
}

async function parseAnthropicStream(
  events: AsyncIterable<unknown>,
  options: ProviderStreamOptions,
): Promise<ProviderChatCompletionResponse> {
  let content = ""
  let usage: unknown = null
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

  const handlePayload = (payload: unknown) => {
    if (!isRecord(payload)) return
    const type = typeof payload.type === "string" ? payload.type : ""
    if (type === "message_start") {
      if (isRecord(payload.message) && payload.message.usage) {
        usage = payload.message.usage
      }
      return
    }
    if (type === "content_block_start") {
      const index = typeof payload.index === "number" ? payload.index : 0
      const block = isRecord(payload.content_block) ? payload.content_block : {}
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
        if (isRecord(block.input)) {
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
      const index = typeof payload.index === "number" ? payload.index : 0
      const delta = isRecord(payload.delta) ? payload.delta : {}
      if (delta.type === "text_delta" && typeof delta.text === "string") {
        appendContent(delta.text)
        return
      }
      if (
        delta.type === "input_json_delta" &&
        typeof delta.partial_json === "string"
      ) {
        const toolBlock = ensureToolBlock(index)
        toolBlock.argsText += delta.partial_json
      }
      return
    }
    if (payload.usage) {
      usage = payload.usage
    }
  }

  for await (const event of events) {
    handlePayload(event)
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
    const client = createAnthropicSdkClient({
      baseUrl: endpoint.replace(/\/messages\/?$/, ""),
      apiKey: resolveValue(this.apiKey),
      headers: resolveValue(this.headers) || "",
      requestOptions: options,
    })

    const payload = {
      ...buildAnthropicPayload(request),
      ...(request.stream ? { stream: true } : {}),
    }
    if (payload.stream) {
      const stream = await client.messages.create({
        ...payload,
        stream: true,
      } as any)
      return parseAnthropicStream(stream as unknown as AsyncIterable<unknown>, options)
    }

    const data = await client.messages.create(payload as any)
    const message = extractAnthropicMessage(data)
    return {
      choices: [
        {
          index: 0,
          message,
        },
      ],
      ...(isRecord(data) ? data : {}),
    }
  }
}

export function extractAnthropicModels(payload: unknown): string[] {
  const items =
    isRecord(payload) && Array.isArray(payload.data) ? payload.data : []
  return items
    .map((item) => (isRecord(item) ? item.id : ""))
    .filter(
      (id): id is string => typeof id === "string" && id.trim().length > 0,
    )
}

export { buildAnthropicModelsUrl, buildAnthropicHeaders }
