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
import { parseAiRequestHeaders } from "@myz/shared/aiHeaderUtils"
import type { JsonRecord } from "@myz/shared/typeUtils"
import {
  isJsonRecord,
  isRecord,
  toJsonValue,
} from "@myz/shared/typeUtils"

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

function buildGeminiRequest(request: ProviderChatCompletionRequest): {
  body: JsonRecord
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

  const body: JsonRecord = {
    contents,
  }

  if (systemParts.length) {
    const parts: JsonRecord[] = [{ text: systemParts.join("\n\n") }]
    body.systemInstruction = {
      parts,
    }
  }

  if (typeof request.temperature === "number") {
    const prevConfig = isJsonRecord(body.generationConfig)
      ? body.generationConfig
      : {}
    body.generationConfig = {
      ...prevConfig,
      temperature: request.temperature,
    }
  }

  const maxTokens =
    typeof request.max_tokens === "number"
      ? request.max_tokens
      : typeof request.max_completion_tokens === "number"
        ? request.max_completion_tokens
        : undefined

  if (typeof maxTokens === "number") {
    const prevConfig = isJsonRecord(body.generationConfig)
      ? body.generationConfig
      : {}
    body.generationConfig = {
      ...prevConfig,
      maxOutputTokens: maxTokens,
    }
  }

  if (tools && tools[0]?.functionDeclarations?.length) {
    body.tools = tools
    const toolConfig: JsonRecord = {
      functionCallingConfig: normalizeGeminiToolChoice(request.tool_choice),
    }
    body.toolConfig = toolConfig
  }

  return { body }
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
  response: Response,
  options: ProviderStreamOptions,
): Promise<ProviderChatCompletionResponse> {
  if (!response.body) {
    throw new Error("Empty streaming response body")
  }

  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  let content = ""
  let usage: unknown = null
  const toolCalls = new Map<
    string,
    { id: string; name: string; argsText: string; thoughtSignature?: string }
  >()

  const appendContent = (text: string) => {
    if (!text) return
    content += text
    options.onStreamDelta?.({ content })
  }

  const ensureToolCall = (id: string) => {
    if (!toolCalls.has(id)) {
      toolCalls.set(id, { id, name: "", argsText: "" })
    }
    return toolCalls.get(id)!
  }

  const handleParts = (parts: unknown[]) => {
    parts.forEach((part, index: number) => {
      if (!isRecord(part)) return
      if (typeof part.text === "string") {
        appendContent(part.text)
        return
      }
      if (part.functionCall) {
        const call = isRecord(part.functionCall) ? part.functionCall : {}
        const callId =
          typeof call.id === "string" && call.id
            ? call.id
            : `call-${index + 1}`
        const entry = ensureToolCall(callId)
        const callName = typeof call.name === "string" ? call.name : ""
        if (callName) {
          entry.name = callName
        }
        if (typeof call.args === "string") {
          entry.argsText += call.args
        } else if (isRecord(call.args)) {
          entry.argsText = JSON.stringify(call.args)
        }
        if (typeof part.thoughtSignature === "string") {
          entry.thoughtSignature = part.thoughtSignature
        }
      }
    })
  }

  const handlePayload = (payload: unknown) => {
    if (!isRecord(payload)) return
    if (payload.usageMetadata) {
      usage = payload.usageMetadata
    }
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
    const candidate = candidates[0]
    const content = isRecord(candidate) ? candidate.content : null
    const parts =
      isRecord(content) && Array.isArray(content.parts) ? content.parts : []
    if (parts.length) {
      handleParts(parts)
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

  const toolCallsArray: ProviderToolCall[] = Array.from(toolCalls.values()).map(
    (call) => {
      let argsText = call.argsText.trim()
      if (!argsText) {
        argsText = "{}"
      } else {
        const parsed = safeJsonParse(argsText)
        if (parsed) {
          argsText = JSON.stringify(parsed)
        }
      }
      return {
        id: call.id,
        type: "function",
        function: {
          name: call.name || "unknown",
          arguments: argsText,
        },
        ...(call.thoughtSignature
          ? {
              extra_content: {
                google: { thoughtSignature: call.thoughtSignature },
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

    const endpoint = request.stream
      ? buildGeminiStreamUrl(resolveValue(this.baseUrl), request.model)
      : buildGeminiGenerateUrl(resolveValue(this.baseUrl), request.model)
    if (!endpoint) {
      throw new Error("API endpoint not configured")
    }

    const { body } = buildGeminiRequest(request)
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildGeminiHeaders(
        resolveValue(this.apiKey),
        resolveValue(this.headers) || "",
      ),
      body: JSON.stringify(body),
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
        return parseGeminiStream(response, options)
      }
    }

    const payload = await response.json()
    const message = extractGeminiMessage(payload)
    return {
      choices: [
        {
          index: 0,
          message,
        },
      ],
      ...(isRecord(payload) ? payload : {}),
    }
  }
}

export function extractGeminiModels(payload: unknown): string[] {
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
    .map((name: string) => name.replace(/^models\//, ""))
}

export { buildGeminiModelsUrl, buildGeminiHeaders }
