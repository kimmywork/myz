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

function buildGeminiHeaders(apiKey: string, headers: string): Record<string, string> {
  const customHeaders = parseAiRequestHeaders(headers)
  const headerNamesLower = new Set(
    Object.keys(customHeaders).map((key) => key.toLowerCase()),
  )
  const merged: Record<string, string> = {}

  if (!headerNamesLower.has("content-type")) {
    merged["Content-Type"] = "application/json"
  }

  if (apiKey && !headerNamesLower.has("x-goog-api-key") && !headerNamesLower.has("authorization")) {
    merged["x-goog-api-key"] = apiKey
  }

  return {
    ...merged,
    ...customHeaders,
  }
}

function toGeminiParts(content: ProviderMessage["content"]): any[] {
  if (typeof content === "string") {
    return content ? [{ text: content }] : []
  }
  if (!Array.isArray(content)) return []

  return content
    .map((part: any) => {
      if (!part) return null
      if (part.type === "text" && typeof part.text === "string") {
        return { text: part.text }
      }
      if (part.type === "image_url" && part.image_url?.url) {
        const parsed = parseDataUrl(part.image_url.url)
        if (!parsed) {
          return { text: `[Image] ${part.image_url.url}` }
        }
        return {
          inlineData: {
            mimeType: parsed.mimeType,
            data: parsed.data,
          },
        }
      }
      return null
    })
    .filter(Boolean)
}

function normalizeGeminiToolChoice(choice: any) {
  if (!choice) return { mode: "AUTO" }
  if (typeof choice === "string") {
    if (choice === "none") return { mode: "NONE" }
    if (choice === "required") return { mode: "ANY" }
    return { mode: "AUTO" }
  }
  const name = choice?.function?.name || choice?.name
  if (name) {
    return {
      mode: "ANY",
      allowedFunctionNames: [name],
    }
  }
  return { mode: "AUTO" }
}

function buildGeminiRequest(
  request: ProviderChatCompletionRequest,
): { body: any; systemInstruction?: string } {
  const contents: any[] = []
  const systemParts: string[] = []

  request.messages.forEach((message) => {
    if (!message) return
    if (message.role === "system" || message.role === "developer") {
      const text = coerceContentToText(message.content)
      if (text) systemParts.push(text)
      return
    }

    if (message.role === "tool") {
      const toolName =
        (message as any)?.metadata?.toolName ||
        (message as any)?.extra_content?.toolName ||
        ""
      const responseValue = safeJsonParse(
        typeof message.content === "string"
          ? message.content
          : coerceContentToText(message.content),
      )
      const functionResponse: any = {
        name: toolName || "tool",
        response: responseValue ?? { output: coerceContentToText(message.content) },
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
      const parts: any[] = []
      const textParts = toGeminiParts(message.content)
      if (textParts.length) parts.push(...textParts)
      if (Array.isArray(message.tool_calls)) {
        message.tool_calls.forEach((toolCall) => {
          if (!toolCall?.function?.name) return
          const args = safeJsonParse(toolCall.function.arguments) ?? {
            _raw: toolCall.function.arguments,
          }
          const functionCall: any = {
            name: toolCall.function.name,
            args,
          }
          if (toolCall.id) {
            functionCall.id = toolCall.id
          }
          const thoughtSignature =
            toolCall?.extra_content?.google?.thoughtSignature ||
            (toolCall as any).thought_signature
          const part: any = { functionCall }
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
        .map((tool) => ({
          name: tool.function?.name,
          description: tool.function?.description,
          parameters: tool.function?.parameters,
        }))
        .filter((tool) => tool.name)
    : []
  const tools =
    declarations.length > 0
      ? [
          {
            functionDeclarations: declarations,
          },
        ]
      : undefined

  const body: any = {
    contents,
  }

  if (systemParts.length) {
    body.systemInstruction = {
      parts: [{ text: systemParts.join("\n\n") }],
    }
  }

  if (typeof request.temperature === "number") {
    body.generationConfig = {
      ...(body.generationConfig || {}),
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
    body.generationConfig = {
      ...(body.generationConfig || {}),
      maxOutputTokens: maxTokens,
    }
  }

  if (tools && tools[0]?.functionDeclarations?.length) {
    body.tools = tools
    body.toolConfig = {
      functionCallingConfig: {
        ...normalizeGeminiToolChoice(request.tool_choice),
      },
    }
  }

  return { body }
}

function extractGeminiMessage(payload: any): ProviderMessage {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : []
  const candidate = candidates[0] || {}
  const content = candidate?.content || {}
  const parts = Array.isArray(content?.parts) ? content.parts : []
  const toolCalls: any[] = []
  const textParts: string[] = []

  parts.forEach((part: any, index: number) => {
    if (!part) return
    if (typeof part.text === "string") {
      textParts.push(part.text)
      return
    }
    if (part.functionCall) {
      const call = part.functionCall
      toolCalls.push({
        id: call.id || `call-${index + 1}`,
        type: "function",
        function: {
          name: call.name || "unknown",
          arguments:
            typeof call.args === "string"
              ? call.args
              : JSON.stringify(call.args || {}),
        },
        extra_content: part.thoughtSignature
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
  let usage: any = null
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

  const handleParts = (parts: any[]) => {
    parts.forEach((part: any, index: number) => {
      if (!part) return
      if (typeof part.text === "string") {
        appendContent(part.text)
        return
      }
      if (part.functionCall) {
        const call = part.functionCall
        const callId = call.id || `call-${index + 1}`
        const entry = ensureToolCall(callId)
        entry.name = call.name || entry.name
        if (typeof call.args === "string") {
          entry.argsText += call.args
        } else if (call.args && typeof call.args === "object") {
          entry.argsText = JSON.stringify(call.args)
        }
        if (part.thoughtSignature) {
          entry.thoughtSignature = part.thoughtSignature
        }
      }
    })
  }

  const handlePayload = (payload: any) => {
    if (!payload) return
    if (payload?.usageMetadata) {
      usage = payload.usageMetadata
    }
    const candidates = Array.isArray(payload?.candidates) ? payload.candidates : []
    const candidate = candidates[0] || {}
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
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

  const toolCallsArray: ProviderToolCall[] = Array.from(toolCalls.values()).map((call) => {
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
        ? { extra_content: { google: { thoughtSignature: call.thoughtSignature } } }
        : {}),
    }
  })

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
      ...payload,
    }
  }
}

export function extractGeminiModels(payload: any): string[] {
  const items = Array.isArray(payload?.models) ? payload.models : []
  return items
    .map((item: any) => item?.name)
    .filter(
      (name: any): name is string =>
        typeof name === "string" && name.trim().length > 0,
    )
    .map((name: string) => name.replace(/^models\//, ""))
}

export { buildGeminiModelsUrl, buildGeminiHeaders }
