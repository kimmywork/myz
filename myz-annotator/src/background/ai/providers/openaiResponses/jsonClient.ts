import type {
  ChatCompletionClient,
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderMessage,
  ProviderStreamOptions,
  ProviderToolCall,
} from "../types.js"
import { buildProviderHeaders } from "../../runtime/openaiCompatible.js"
import { coerceContentToText, normalizeBaseUrl } from "../utils.js"

type ValueOrGetter<T> = T | (() => T)

function resolveValue<T>(value: ValueOrGetter<T>): T {
  return typeof value === "function" ? (value as () => T)() : value
}

export interface OpenAIResponsesClientOptions {
  baseUrl: ValueOrGetter<string>
  apiKey: ValueOrGetter<string>
  headers: ValueOrGetter<string>
  syncHeaders?: () => Promise<void>
}

function buildResponsesUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return ""
  if (normalized.endsWith("/responses")) return normalized
  if (normalized.endsWith("/v1")) return `${normalized}/responses`
  if (normalized.includes("/v1/")) {
    return `${normalized.replace(/\/v1\/.*$/, "/v1")}/responses`
  }
  return `${normalized}/v1/responses`
}

function buildInputParts(
  content: ProviderMessage["content"],
  role: "user" | "assistant",
): any[] {
  if (typeof content === "string") {
    return [
      {
        type: role === "user" ? "input_text" : "output_text",
        text: content,
      },
    ]
  }

  if (!Array.isArray(content)) return []

  return content
    .map((part: any) => {
      if (!part) return null
      if (part.type === "text" && typeof part.text === "string") {
        return {
          type: role === "user" ? "input_text" : "output_text",
          text: part.text,
        }
      }
      if (part.type === "image_url" && part.image_url?.url) {
        return {
          type: "input_image",
          image_url: {
            url: part.image_url.url,
          },
        }
      }
      return null
    })
    .filter(Boolean)
}

function buildInputFromMessages(messages: ProviderMessage[]): {
  instructions: string
  input: any[]
} {
  const instructions: string[] = []
  const input: any[] = []

  messages.forEach((message) => {
    if (!message) return
    if (message.role === "system" || message.role === "developer") {
      const text = coerceContentToText(message.content)
      if (text) instructions.push(text)
      return
    }

    if (message.role === "tool") {
      const output = typeof message.content === "string" ? message.content : coerceContentToText(message.content)
      input.push({
        type: "function_call_output",
        call_id: message.tool_call_id || "",
        output: output || "",
      })
      return
    }

    if (message.role === "assistant") {
      const parts = buildInputParts(message.content, "assistant")
      if (parts.length) {
        input.push({
          type: "message",
          role: "assistant",
          content: parts,
        })
      }

      if (Array.isArray(message.tool_calls)) {
        message.tool_calls.forEach((toolCall, index) => {
          if (!toolCall?.function?.name) return
          input.push({
            type: "function_call",
            call_id: toolCall.id || `call-${index + 1}`,
            name: toolCall.function.name,
            arguments: toolCall.function.arguments || "{}",
          })
        })
      }
      return
    }

    if (message.role === "user") {
      const parts = buildInputParts(message.content, "user")
      if (!parts.length) return
      input.push({
        type: "message",
        role: "user",
        content: parts,
      })
    }
  })

  return {
    instructions: instructions.filter(Boolean).join("\n\n"),
    input,
  }
}

function normalizeToolChoice(choice: any) {
  if (!choice) return undefined
  if (typeof choice === "string") return choice
  const name =
    choice?.function?.name ||
    choice?.name ||
    (choice?.type === "function" ? choice?.function?.name : "")
  if (!name) return undefined
  return { type: "function", name }
}

async function parseResponsesStream(
  response: Response,
  options: ProviderStreamOptions,
): Promise<ProviderChatCompletionResponse> {
  if (!response.body) {
    throw new Error("Empty streaming response body")
  }

  const decoder = new TextDecoder()
  let buffer = ""
  let content = ""
  let reasoning = ""
  let finalResponse: any = null
  const toolCalls = new Map<string, ProviderToolCall>()

  const ensureToolCall = (id: string) => {
    if (!toolCalls.has(id)) {
      toolCalls.set(id, {
        id,
        type: "function",
        function: {
          name: "",
          arguments: "",
        },
      })
    }
    return toolCalls.get(id)!
  }

  const appendToolCallDelta = (payload: any) => {
    const callId =
      payload?.call_id ||
      payload?.id ||
      payload?.tool_call_id ||
      payload?.item_id ||
      ""
    if (!callId) return
    const toolCall = ensureToolCall(callId)
    const name = payload?.name || payload?.function?.name
    if (typeof name === "string" && name) {
      toolCall.function.name = name
    }
    const argsDelta =
      payload?.arguments ??
      payload?.delta ??
      payload?.input ??
      payload?.function?.arguments
    if (argsDelta != null) {
      const text =
        typeof argsDelta === "string" ? argsDelta : JSON.stringify(argsDelta || {})
      toolCall.function.arguments = (toolCall.function.arguments || "") + text
    }
  }

  const handlePayload = (payload: any) => {
    const type = typeof payload?.type === "string" ? payload.type : ""
    if (type === "response.completed" && payload?.response) {
      finalResponse = payload.response
      return
    }
    if (type.includes("output_text") && typeof payload?.delta === "string") {
      content += payload.delta
      options.onStreamDelta?.({ content, reasoning })
      return
    }
    if (type.includes("reasoning") && typeof payload?.delta === "string") {
      reasoning += payload.delta
      options.onStreamDelta?.({ content, reasoning })
      return
    }
    if (type.includes("function_call") || type.includes("tool_call")) {
      appendToolCallDelta(payload)
      return
    }
    if (payload?.delta && typeof payload.delta === "string") {
      content += payload.delta
      options.onStreamDelta?.({ content, reasoning })
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
      const lines = rawEvent.split("\n")
      for (const line of lines) {
        if (!line.startsWith("data:")) continue
        const dataStr = line.slice(5).trim()
        if (!dataStr) continue
        if (dataStr === "[DONE]") {
          boundary = -1
          break
        }
        try {
          const payload = JSON.parse(dataStr)
          handlePayload(payload)
        } catch {
          // ignore parse errors
        }
      }
      boundary = buffer.indexOf("\n\n")
    }
  }

  if (finalResponse) {
    const message = extractResponseMessage(finalResponse)
    return {
      choices: [
        {
          index: 0,
          message,
        },
      ],
      ...finalResponse,
    }
  }

  const toolCallsArray = Array.from(toolCalls.values()).filter(
    (call) => call.function.name,
  )
  const message: ProviderMessage = {
    role: "assistant",
    content: content.trim(),
    ...(toolCallsArray.length ? { tool_calls: toolCallsArray } : {}),
    ...(reasoning ? { reasoning_content: reasoning } : {}),
  }
  return {
    choices: [
      {
        index: 0,
        message,
      },
    ],
  }
}

function extractResponseMessage(payload: any): ProviderMessage {
  const outputItems = Array.isArray(payload?.output) ? payload.output : []
  const toolCalls: any[] = []
  const textParts: string[] = []
  let reasoning = ""

  outputItems.forEach((item: any, index: number) => {
    if (!item) return
    if (item.type === "message" && item.role === "assistant") {
      const content = Array.isArray(item.content) ? item.content : []
      content.forEach((part: any) => {
        if (part?.type === "output_text" && typeof part.text === "string") {
          textParts.push(part.text)
        }
      })
      return
    }

    if (item.type === "function_call" || item.type === "tool_call") {
      const rawArgs = item.arguments ?? item.input
      toolCalls.push({
        id: item.call_id || item.id || `call-${index + 1}`,
        type: "function",
        function: {
          name: item.name || "unknown",
          arguments:
            typeof rawArgs === "string"
              ? rawArgs
              : JSON.stringify(rawArgs || {}),
        },
      })
      return
    }

    if (item.type === "reasoning") {
      if (typeof item.summary === "string") {
        reasoning = reasoning || item.summary
      }
    }
  })

  const message: ProviderMessage = {
    role: "assistant",
    content: textParts.join("\n").trim(),
  }
  if (toolCalls.length) {
    message.tool_calls = toolCalls
  }
  if (reasoning) {
    message.reasoning_content = reasoning
  }
  return message
}

export class OpenAIResponsesJsonClient implements ChatCompletionClient {
  private baseUrl: ValueOrGetter<string>
  private apiKey: ValueOrGetter<string>
  private headers: ValueOrGetter<string>
  private syncHeaders?: () => Promise<void>

  constructor(options: OpenAIResponsesClientOptions) {
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

    const endpoint = buildResponsesUrl(resolveValue(this.baseUrl))
    if (!endpoint) {
      throw new Error("API endpoint not configured")
    }

    const { instructions, input } = buildInputFromMessages(request.messages || [])
    const toolChoice = normalizeToolChoice(request.tool_choice)
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildProviderHeaders(
        resolveValue(this.apiKey),
        resolveValue(this.headers) || "",
      ),
      body: JSON.stringify({
        model: request.model,
        input,
        ...(instructions ? { instructions } : {}),
        ...(typeof request.temperature === "number" ? { temperature: request.temperature } : {}),
        ...(typeof request.max_tokens === "number" ? { max_output_tokens: request.max_tokens } : {}),
        ...(typeof request.max_completion_tokens === "number"
          ? { max_output_tokens: request.max_completion_tokens }
          : {}),
        ...(request.tools
          ? (() => {
              const tools = request.tools
                .map((tool: any) => {
                  if (tool?.type === "function" && tool.function) {
                    return {
                      type: "function",
                      name: tool.function?.name,
                      description: tool.function?.description,
                      parameters: tool.function?.parameters,
                      ...(typeof tool.function?.strict === "boolean"
                        ? { strict: tool.function.strict }
                        : {}),
                    }
                  }
                  return tool
                })
                .filter((tool: any) => tool && tool.name)
              return tools.length ? { tools } : {}
            })()
          : {}),
        ...(toolChoice ? { tool_choice: toolChoice } : {}),
        ...(typeof request.parallel_tool_calls === "boolean"
          ? { parallel_tool_calls: request.parallel_tool_calls }
          : {}),
        ...(request.response_format ? { response_format: request.response_format } : {}),
        ...(request.extra_body ? request.extra_body : {}),
        stream: Boolean(request.stream),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
      )
    }

    const contentType = response.headers.get("content-type") || ""
    if (request.stream && contentType.includes("text/event-stream")) {
      return parseResponsesStream(response, _options)
    }

    const payload = await response.json()
    const message = extractResponseMessage(payload)

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
