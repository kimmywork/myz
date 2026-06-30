import { GoogleGenAI } from "@google/genai"
import { parseAiRequestHeaders } from "@myz/shared/aiHeaderUtils"
import type { JsonRecord } from "@myz/shared/typeUtils"
import { isJsonRecord, isRecord, toJsonValue } from "@myz/shared/typeUtils"
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

export interface GeminiClientOptions {
  baseUrl: ValueOrGetter<string>
  apiKey: ValueOrGetter<string>
  headers: ValueOrGetter<string>
  syncHeaders?: () => Promise<void>
}

function buildGeminiModelsUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return ""
  if (normalized.endsWith("/models")) return normalized
  return `${normalized}/models`
}

function buildGeminiGenerateUrl(baseUrl: string, model: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return ""
  const base = normalized.endsWith("/models")
    ? normalized.slice(0, -"/models".length)
    : normalized
  const trimmedModel = typeof model === "string" ? model.trim() : ""
  const modelPath = trimmedModel.startsWith("models/")
    ? trimmedModel
    : `models/${trimmedModel}`
  return `${base}/${modelPath}:generateContent`
}

function buildGeminiStreamUrl(baseUrl: string, model: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return ""
  const base = normalized.endsWith("/models")
    ? normalized.slice(0, -"/models".length)
    : normalized
  const trimmedModel = typeof model === "string" ? model.trim() : ""
  const modelPath = trimmedModel.startsWith("models/")
    ? trimmedModel
    : `models/${trimmedModel}`
  return `${base}/${modelPath}:streamGenerateContent?alt=sse`
}

function buildGeminiSdkBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return ""
  if (normalized.endsWith("/models")) {
    return normalized.slice(0, -"/models".length)
  }
  return normalized
}

function buildGeminiHeaders(
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
    !headerNamesLower.has("x-goog-api-key") &&
    !headerNamesLower.has("authorization")
  ) {
    merged["x-goog-api-key"] = apiKey
  }

  return {
    ...merged,
    ...customHeaders,
  }
}

export function createGeminiSdkClient(options: {
  baseUrl: string
  apiKey: string
  headers: string
}) {
  return new GoogleGenAI({
    apiKey: options.apiKey || "myz-gemini-placeholder",
    httpOptions: {
      baseUrl: buildGeminiSdkBaseUrl(options.baseUrl),
      apiVersion: "",
      headers: buildGeminiHeaders(options.apiKey, options.headers || ""),
    },
  })
}

function toGeminiParts(content: ProviderMessage["content"]): JsonRecord[] {
  if (typeof content === "string") {
    return content ? [{ text: content }] : []
  }
  if (!Array.isArray(content)) return []

  return content
    .map((part) => {
      if (!isRecord(part)) return null
      if (part.type === "text" && typeof part.text === "string") {
        const entry: JsonRecord = { text: part.text }
        return entry
      }
      if (
        part.type === "image_url" &&
        isRecord(part.image_url) &&
        part.image_url.url
      ) {
        const parsed = parseDataUrl(String(part.image_url.url))
        if (!parsed) {
          const entry: JsonRecord = {
            text: `[Image] ${String(part.image_url.url)}`,
          }
          return entry
        }
        const inlineData: JsonRecord = {
          mimeType: parsed.mimeType,
          data: parsed.data,
        }
        const entry: JsonRecord = { inlineData }
        return entry
      }
      return null
    })
    .filter((item): item is JsonRecord => Boolean(item))
}

function normalizeGeminiToolChoice(choice: unknown): JsonRecord {
  if (!choice) return { mode: "AUTO" }
  if (typeof choice === "string") {
    if (choice === "none") return { mode: "NONE" }
    if (choice === "required") return { mode: "ANY" }
    return { mode: "AUTO" }
  }
  if (!isRecord(choice)) return { mode: "AUTO" }
  const rawName =
    (isRecord(choice.function) ? choice.function.name : undefined) ||
    choice.name
  const name = typeof rawName === "string" ? rawName : ""
  if (name) {
    return {
      mode: "ANY",
      allowedFunctionNames: [name],
    }
  }
  return { mode: "AUTO" }
}

function normalizeGeminiThinkingConfig(request: ProviderChatCompletionRequest) {
  const extraBody = isRecord(request.extra_body) ? request.extra_body : null
  const google = extraBody && isRecord(extraBody.google) ? extraBody.google : null
  const thinkingConfig =
    google && isRecord(google.thinking_config) ? google.thinking_config : null
  if (!thinkingConfig) return undefined

  const normalized: JsonRecord = {}
  if (typeof thinkingConfig.include_thoughts === "boolean") {
    normalized.includeThoughts = thinkingConfig.include_thoughts
  }
  return Object.keys(normalized).length ? normalized : undefined
}

function buildGeminiRequest(
  request: ProviderChatCompletionRequest,
  options: ProviderStreamOptions = {},
): {
  contents: JsonRecord[]
  config?: JsonRecord
} {
  const contents: JsonRecord[] = []
  const systemParts: string[] = []

  request.messages.forEach((message) => {
    if (!message) return
    if (message.role === "system" || message.role === "developer") {
      const text = coerceContentToText(message.content)
      if (text) systemParts.push(text)
      return
    }

    if (message.role === "tool") {
      const metadata = isRecord(message.metadata) ? message.metadata : null
      const extraContent = isRecord(message.extra_content)
        ? message.extra_content
        : null
      const toolName =
        (metadata && typeof metadata.toolName === "string"
          ? metadata.toolName
          : "") ||
        (extraContent && typeof extraContent.toolName === "string"
          ? extraContent.toolName
          : "")
      const responseValue = safeJsonParse(
        typeof message.content === "string"
          ? message.content
          : coerceContentToText(message.content),
      )
      const responsePayload = toJsonValue(responseValue, {
        output: coerceContentToText(message.content),
      })
      const functionResponse: JsonRecord = {
        name: toolName || "tool",
        response: responsePayload,
      }
      if (message.tool_call_id) {
        functionResponse.id = message.tool_call_id
      }
      contents.push({
        role: "user",
        parts: [{ functionResponse }],
      })
      return
    }

    if (message.role === "assistant") {
      const parts: JsonRecord[] = []
      const textParts = toGeminiParts(message.content)
      if (textParts.length) parts.push(...textParts)
      if (Array.isArray(message.tool_calls)) {
        message.tool_calls.forEach((toolCall) => {
          if (!toolCall?.function?.name) return
          const args = toJsonValue(
            safeJsonParse(toolCall.function.arguments),
            {
              _raw: toolCall.function.arguments,
            },
          )
          const functionCall: JsonRecord = {
            name: toolCall.function.name,
            args,
          }
          if (toolCall.id) {
            functionCall.id = toolCall.id
          }
          const thoughtSignature =
            (isRecord(toolCall.extra_content) &&
            isRecord(toolCall.extra_content.google) &&
            typeof toolCall.extra_content.google.thoughtSignature === "string"
              ? toolCall.extra_content.google.thoughtSignature
              : undefined) ||
            (typeof toolCall.thought_signature === "string"
              ? toolCall.thought_signature
              : undefined)
          const part: JsonRecord = { functionCall }
          if (thoughtSignature) {
            part.thoughtSignature = thoughtSignature
          }
          parts.push(part)
        })
      }
      if (parts.length) {
        contents.push({ role: "model", parts })
      }
      return
    }

    if (message.role === "user") {
      const parts = toGeminiParts(message.content)
      if (!parts.length) return
      contents.push({ role: "user", parts })
    }
  })

  const declarations = Array.isArray(request.tools)
    ? request.tools
        .map((tool) => {
          const entry: JsonRecord = {
            name: tool.function?.name || "",
            description: tool.function?.description || "",
            parameters: tool.function?.parameters || {},
          }
          return entry
        })
        .filter((tool) => typeof tool.name === "string" && tool.name)
    : []
  const tools =
    declarations.length > 0
      ? [
          {
            functionDeclarations: declarations,
          },
        ]
      : undefined

  if (!contents.length) {
    contents.push({
      role: "user",
      parts: [{ text: "" }],
    })
  }

  const config: JsonRecord = {}

  if (systemParts.length) {
    config.systemInstruction = {
      parts: [{ text: systemParts.join("\n\n") }],
    }
  }

  if (typeof request.temperature === "number") {
    config.temperature = request.temperature
  }

  const maxTokens =
    typeof request.max_tokens === "number"
      ? request.max_tokens
      : typeof request.max_completion_tokens === "number"
        ? request.max_completion_tokens
        : undefined

  if (typeof maxTokens === "number") {
    config.maxOutputTokens = maxTokens
  }

  const thinkingConfig = normalizeGeminiThinkingConfig(request)
  if (thinkingConfig) {
    config.thinkingConfig = thinkingConfig
  } else if (options.enableGeminiThinking) {
    config.thinkingConfig = {
      includeThoughts: true,
    }
  }

  if (tools && tools[0]?.functionDeclarations?.length) {
    config.tools = tools
    config.toolConfig = {
      functionCallingConfig: normalizeGeminiToolChoice(request.tool_choice),
    }
  }

  return Object.keys(config).length ? { contents, config } : { contents }
}

function mergeGeminiSnapshotText(current: string, incoming: string) {
  if (!incoming) return current
  if (!current) return incoming
  if (current === incoming) return current
  if (incoming.startsWith(current)) return incoming
  if (current.startsWith(incoming)) return current
  return current + incoming
}

function mergeGeminiToolArguments(current: string, incoming: string) {
  if (!incoming) return current
  if (!current) return incoming
  if (current === incoming) return current
  if (incoming.startsWith(current)) return incoming
  if (current.startsWith(incoming)) return current
  return current + incoming
}

function extractGeminiMessage(payload: unknown): ProviderMessage {
  const candidates =
    isRecord(payload) && Array.isArray(payload.candidates)
      ? payload.candidates
      : []
  const candidate = candidates[0]
  const content = isRecord(candidate) ? candidate.content : null
  const parts =
    isRecord(content) && Array.isArray(content.parts) ? content.parts : []
  const toolCalls: ProviderToolCall[] = []
  const textParts: string[] = []

  parts.forEach((part, index: number) => {
    if (!isRecord(part)) return
    if (typeof part.text === "string") {
      textParts.push(part.text)
      return
    }
    if (part.functionCall) {
      const call = isRecord(part.functionCall) ? part.functionCall : {}
      const callId =
        typeof call.id === "string" && call.id ? call.id : `call-${index + 1}`
      const callName =
        typeof call.name === "string" && call.name ? call.name : "unknown"
      const callArgs = call.args
      toolCalls.push({
        id: callId,
        type: "function",
        function: {
          name: callName,
          arguments:
            typeof callArgs === "string"
              ? callArgs
              : JSON.stringify(isJsonRecord(callArgs) ? callArgs : {}),
        },
        extra_content:
          typeof part.thoughtSignature === "string"
            ? { google: { thoughtSignature: part.thoughtSignature } }
            : undefined,
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

async function parseGeminiStream(
  events: AsyncIterable<unknown>,
  options: ProviderStreamOptions,
): Promise<ProviderChatCompletionResponse> {
  let content = ""
  let usage: unknown = null
  const toolCalls = new Map<
    string,
    {
      id: string
      name: string
      argsText: string
      thoughtSignature?: string
    }
  >()

  const ensureToolCall = (id: string) => {
    if (!toolCalls.has(id)) {
      toolCalls.set(id, {
        id,
        name: "",
        argsText: "",
      })
    }
    return toolCalls.get(id)!
  }

  for await (const payload of events) {
    if (isRecord(payload) && payload.usageMetadata) {
      usage = payload.usageMetadata
    }

    const message = extractGeminiMessage(payload)
    const text =
      typeof message.content === "string" ? message.content.trim() : ""
    if (text) {
      content = mergeGeminiSnapshotText(content, text)
      options.onStreamDelta?.({ content })
    }

    if (!Array.isArray(message.tool_calls)) continue

    message.tool_calls.forEach((toolCall, index) => {
      const id =
        typeof toolCall?.id === "string" && toolCall.id
          ? toolCall.id
          : `call-${index + 1}`
      const entry = ensureToolCall(id)
      if (toolCall.function?.name) {
        entry.name = toolCall.function.name
      }
      const argumentsText =
        typeof toolCall.function?.arguments === "string"
          ? toolCall.function.arguments
          : ""
      entry.argsText = mergeGeminiToolArguments(entry.argsText, argumentsText)
      const thoughtSignature =
        isRecord(toolCall.extra_content) &&
        isRecord(toolCall.extra_content.google) &&
        typeof toolCall.extra_content.google.thoughtSignature === "string"
          ? toolCall.extra_content.google.thoughtSignature
          : undefined
      if (thoughtSignature) {
        entry.thoughtSignature = thoughtSignature
      }
    })
  }

  const toolCallsArray: ProviderToolCall[] = Array.from(toolCalls.values()).map(
    (toolCall) => {
      let argsText = toolCall.argsText.trim()
      if (!argsText) {
        argsText = "{}"
      } else {
        const parsed = safeJsonParse(argsText)
        if (parsed) {
          argsText = JSON.stringify(parsed)
        }
      }
      return {
        id: toolCall.id,
        type: "function",
        function: {
          name: toolCall.name || "unknown",
          arguments: argsText,
        },
        ...(toolCall.thoughtSignature
          ? {
              extra_content: {
                google: {
                  thoughtSignature: toolCall.thoughtSignature,
                },
              },
            }
          : {}),
      }
    },
  )

  const message: ProviderMessage = {
    role: "assistant",
    content,
  }
  if (toolCallsArray.length) {
    message.tool_calls = toolCallsArray
  }

  return {
    choices: [{ index: 0, message }],
    ...(usage ? { usage } : {}),
  }
}

export class GeminiJsonClient implements ChatCompletionClient {
  private baseUrl: ValueOrGetter<string>
  private apiKey: ValueOrGetter<string>
  private headers: ValueOrGetter<string>
  private syncHeaders?: () => Promise<void>

  constructor(options: GeminiClientOptions) {
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

    const baseUrl = resolveValue(this.baseUrl)
    const endpoint = request.stream
      ? buildGeminiStreamUrl(baseUrl, request.model)
      : buildGeminiGenerateUrl(baseUrl, request.model)
    if (!endpoint) {
      throw new Error("API endpoint not configured")
    }

    const client = createGeminiSdkClient({
      baseUrl,
      apiKey: resolveValue(this.apiKey),
      headers: resolveValue(this.headers) || "",
    })
    const payload = {
      model: request.model,
      ...buildGeminiRequest(request, options),
    }

    await emitProviderRequestDebug(options, {
      endpoint,
      transport: request.stream ? "sse" : "json",
      body: payload,
    })

    if (request.stream) {
      const stream = await client.models.generateContentStream(payload as any)
      return parseGeminiStream(stream as AsyncIterable<unknown>, options)
    }

    const response = await client.models.generateContent(payload as any)
    const message = extractGeminiMessage(response)
    return {
      choices: [
        {
          index: 0,
          message,
        },
      ],
      ...(isRecord(response) ? response : {}),
    }
  }
}

export function extractGeminiModels(payload: unknown): string[] {
  const items = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.models)
      ? payload.models
      : []
  return items
    .map((item) =>
      isRecord(item) && typeof item.name === "string" ? item.name : "",
    )
    .filter(
      (name): name is string =>
        typeof name === "string" && name.trim().length > 0,
    )
    .map((name: string) => name.replace(/^models\//, ""))
}

export { buildGeminiModelsUrl, buildGeminiHeaders }
