import type { Capability } from "../capability.js"
import type {
  ProviderChatCompletionRequest,
  ProviderChatCompletionResponse,
  ProviderStreamOptions,
  ProviderToolCall,
} from "../types.js"
import {
  normalizeReasoningChunk,
  splitContentAndReasoning,
} from "../../normalize/message.js"
import { extractGeminiThoughtSegments } from "../../vendors/googleGemini.js"

type ValueOrGetter<T> = T | (() => T)

function resolveValue<T>(value: ValueOrGetter<T>): T {
  return typeof value === "function" ? (value as () => T)() : value
}

function isGeminiModel(model: unknown) {
  return typeof model === "string" && /^gemini/i.test(model)
}

interface StreamAccumulator {
  pushDelta: (delta: any) => void
  getContent: () => string
  getReasoning: () => string
  getToolCalls: () => ProviderToolCall[]
}

function createDefaultAccumulator(): StreamAccumulator {
  let content = ""
  let reasoning = ""
  const toolCalls: ProviderToolCall[] = []

  const ensureToolCallSlot = (index: number, partial: any) => {
    if (!toolCalls[index]) {
      toolCalls[index] = {
        id: partial?.id || `tool-${index + 1}`,
        type: "function",
        function: {
          name: partial?.function?.name || "",
          arguments: "",
        },
        ...(partial?.extra_content ? { extra_content: partial.extra_content } : {}),
      }
    }

    const target = toolCalls[index] as any
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
        : typeof partial?.extra_content?.google?.thought_signature === "string"
          ? partial.extra_content.google.thought_signature
          : undefined

    if (thoughtSignature) {
      target.extra_content = {
        ...(target.extra_content || {}),
        google: {
          ...((target.extra_content?.google as any) || {}),
          thought_signature: thoughtSignature,
        },
      }
    }
  }

  return {
    pushDelta(delta: any) {
      if (!delta) return

      const { text: deltaText, reasoning: reasoningFromContent } =
        splitContentAndReasoning(delta.content)
      if (deltaText) {
        content += deltaText
      }

      const reasoningParts = []
      if (reasoningFromContent) reasoningParts.push(reasoningFromContent)
      ;[delta.reasoning_content, delta.reasoning].forEach((field) => {
        const normalized = normalizeReasoningChunk(field)
        if (normalized) {
          reasoningParts.push(normalized)
        }
      })
      if (reasoningParts.length) {
        reasoning += reasoningParts.join("")
      }

      if (Array.isArray(delta.tool_calls)) {
        delta.tool_calls.forEach((callDelta: any, idx: number) => {
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

function createGeminiAccumulator(): StreamAccumulator {
  let visible = ""
  let thought = ""

  const base = createDefaultAccumulator()

  const getToolCalls = () => base.getToolCalls()

  return {
    pushDelta(delta: any) {
      if (!delta) return

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

      const reasoningParts = []
      if (reasoningFromContent) reasoningParts.push(reasoningFromContent)
      ;[delta.reasoning_content, delta.reasoning].forEach((field) => {
        const normalized = normalizeReasoningChunk(field)
        if (normalized) {
          reasoningParts.push(normalized)
        }
      })
      if (reasoningParts.length) {
        thought = [thought, reasoningParts.join("")].filter(Boolean).join("")
      }

      if (Array.isArray(delta.tool_calls)) {
        ;(base as any).pushDelta({ tool_calls: delta.tool_calls })
      }
    },
    getContent() {
      return visible
    },
    getReasoning() {
      return thought
    },
    getToolCalls() {
      return getToolCalls()
    },
  }
}

async function requestSseCompletion(
  endpoint: string,
  headers: Record<string, string>,
  request: ProviderChatCompletionRequest,
  options: ProviderStreamOptions = {},
): Promise<ProviderChatCompletionResponse> {
  let usage: any = null
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...request,
      stream: true,
      stream_options: {
        ...((request as any).stream_options || {}),
        include_usage: true,
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
    )
  }

  const contentType = response.headers.get("content-type") || ""
  if (!response.body || !contentType.includes("text/event-stream")) {
    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch (error) {
      throw new Error(
        `Failed to parse streaming response: ${(error as Error).message}`,
      )
    }
  }

  const accumulator = isGeminiModel(request.model)
    ? createGeminiAccumulator()
    : createDefaultAccumulator()

  const reader = response.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  let done = false

  while (!done) {
    const { value, done: readerDone } = await reader.read()
    if (readerDone) {
      done = true
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split("\n\n")
    buffer = events.pop() || ""

    for (const event of events) {
      const lines = event.split("\n")
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line.startsWith("data:")) continue
        const dataStr = line.slice(5).trim()
        if (!dataStr) continue
        if (dataStr === "[DONE]") {
          done = true
          continue
        }

        let parsed: any
        try {
          parsed = JSON.parse(dataStr)
        } catch {
          continue
        }

        if (parsed?.usage) {
          usage = parsed.usage
          continue
        }

        const delta = parsed?.choices?.[0]?.delta
        if (!delta) continue

        accumulator.pushDelta(delta)

        options.onStreamDelta?.({
          content: accumulator.getContent(),
          reasoning: accumulator.getReasoning(),
        })
      }
      if (done) break
    }
  }

  reader.releaseLock()

  const message: any = {
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
    ...(usage ? { usage } : {}),
  }
}

export interface SseStreamingCapabilityOptions {
  endpoint: ValueOrGetter<string>
  buildHeaders: ValueOrGetter<Record<string, string>>
  syncHeaders?: () => Promise<void>
}

export function createSseStreamingCapability(
  options: SseStreamingCapabilityOptions,
): Capability {
  return (client) => ({
    async createCompletion(request, streamOptions) {
      if (!request?.stream) {
        return client.createCompletion(request, streamOptions)
      }

      await options.syncHeaders?.()
      const endpoint = resolveValue(options.endpoint)
      if (!endpoint) {
        throw new Error("API endpoint not configured")
      }

      return requestSseCompletion(
        endpoint,
        resolveValue(options.buildHeaders),
        request,
        streamOptions,
      )
    },
  })
}
