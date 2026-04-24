import { splitGeminiThoughtTaggedContent } from "../../vendors/googleGemini"
import type { Capability } from "../capability"
import type {
  ProviderChatCompletionRequest,
  ProviderMessage,
  ProviderToolCall,
  ProviderToolSpec,
  ProviderStreamOptions,
} from "../types"
import { isRecord } from "@myz/shared/typeUtils"

export interface ToolCallingCapabilityOptions {
  getTools: () => Promise<ProviderToolSpec[]>
  executeToolCall: (toolCall: ProviderToolCall) => Promise<unknown>
}

const TOOL_SELECT_NAME = "SelectTools"
const TOOL_SELECT_CANDIDATES = new Set([
  TOOL_SELECT_NAME,
  `myz-local:${TOOL_SELECT_NAME}`,
])

function isToolSelectName(rawName: unknown) {
  const name = typeof rawName === "string" ? rawName : ""
  if (!name) return false
  if (TOOL_SELECT_CANDIDATES.has(name)) return true
  if (name.includes(":") && name.split(":").pop() === TOOL_SELECT_NAME) {
    return true
  }
  return false
}

function sanitizeAssistantContent(message: ProviderMessage) {
  const rawContent = message?.content
  const rawThoughtFlag = Boolean(
    isRecord(message.extra_content) &&
      isRecord(message.extra_content.google) &&
      message.extra_content.google.thought,
  )

  if (typeof rawContent !== "string") {
    return ""
  }

  if (rawThoughtFlag && !rawContent.includes("<thought>")) {
    return ""
  }

  return splitGeminiThoughtTaggedContent(rawContent).text || ""
}

function parseToolArgs(raw: unknown): Record<string, unknown> {
  if (raw == null) return {}
  if (isRecord(raw)) return raw
  if (typeof raw !== "string") return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function serializeToolResult(result: unknown) {
  if (typeof result === "string") {
    return result
  }

  if (isRecord(result) && Array.isArray(result.content)) {
    return result.content
      .filter((c): c is { type: string; text?: string } => {
        return isRecord(c) && c.type === "text"
      })
      .map((c) => c.text || "")
      .join("\n")
  }

  try {
    return JSON.stringify(result)
  } catch {
    return String(result)
  }
}

function mergeUsageValues(existing: unknown, incoming: unknown): unknown {
  if (incoming == null) return existing

  if (typeof incoming === "number" && Number.isFinite(incoming)) {
    const current =
      typeof existing === "number" && Number.isFinite(existing) ? existing : 0
    return current + incoming
  }

  if (isRecord(incoming)) {
    const base = isRecord(existing) ? existing : {}
    const merged: Record<string, unknown> = {}
    const keys = new Set([...Object.keys(base), ...Object.keys(incoming)])
    keys.forEach((key) => {
      const nextValue = mergeUsageValues(base[key], incoming[key])
      if (nextValue !== undefined) {
        merged[key] = nextValue
      }
    })
    return merged
  }

  if (Array.isArray(incoming)) {
    return incoming.slice()
  }

  return incoming
}

function extractResponseUsage(response: unknown) {
  if (isRecord(response) && isRecord(response.usage)) {
    return response.usage
  }
  const message =
    isRecord(response) &&
    Array.isArray(response.choices) &&
    isRecord(response.choices[0]) &&
    isRecord(response.choices[0].message)
      ? response.choices[0].message
      : null
  return message && isRecord(message.usage) ? message.usage : null
}

function withAggregatedUsage<T>(response: T, usage: Record<string, unknown> | null): T {
  if (!usage || !isRecord(response)) return response
  return {
    ...response,
    usage,
  }
}

function extractResponsesContinuationId(response: unknown) {
  if (!isRecord(response)) return ""
  const id = typeof response.id === "string" ? response.id.trim() : ""
  if (!id) return ""
  if (response.object === "response") return id
  if (Array.isArray(response.output)) return id
  return ""
}

function isInstructionMessage(message: ProviderMessage | undefined) {
  return message?.role === "system" || message?.role === "developer"
}

function supportsPreviousResponseId(request: ProviderChatCompletionRequest) {
  return request.supports_previous_response_id === true
}

export function createToolCallingCapability(
  options: ToolCallingCapabilityOptions,
): Capability {
  return (client) => ({
    async createCompletion(
      request,
      completionOptions: ProviderStreamOptions & {
        dynamicToolSelection?: {
          enabled?: boolean
          candidates?: string[]
          selectToolNames: (need: string, candidates: string[]) => Promise<
            string[]
          >
          setActiveToolFilter?: (toolNames: string[] | null) => void
        }
      } = {},
    ) {
      let currentRequest: ProviderChatCompletionRequest = {
        ...request,
      }

      const toolingOverrides = completionOptions?.tooling || null
      const toolChoice = toolingOverrides?.toolChoice
      const parallelToolCalls = toolingOverrides?.parallelToolCalls
      const strictSchema =
        typeof toolingOverrides?.strict === "boolean"
          ? toolingOverrides.strict
          : undefined
      let aggregatedUsage: Record<string, unknown> | null = null

      while (true) {
        const rawTools = await options.getTools()
        const tools =
          typeof strictSchema === "boolean"
            ? rawTools.map((tool) => {
                if (!tool || tool.type !== "function") return tool
                return {
                  ...tool,
                  function: {
                    ...tool.function,
                    strict: strictSchema,
                  },
                }
              })
            : rawTools
        currentRequest = {
          ...currentRequest,
          tools: tools?.length ? tools : currentRequest.tools,
          ...(toolChoice ? { tool_choice: toolChoice } : {}),
          ...(typeof parallelToolCalls === "boolean"
            ? { parallel_tool_calls: parallelToolCalls }
            : {}),
        }

        const response = await client.createCompletion(
          currentRequest,
          completionOptions,
        )
        const usage = extractResponseUsage(response)
        const mergedUsage = mergeUsageValues(aggregatedUsage || {}, usage)
        aggregatedUsage = isRecord(mergedUsage) ? mergedUsage : aggregatedUsage
        const message = response?.choices?.[0]?.message
        if (!message) {
          return withAggregatedUsage(response, aggregatedUsage)
        }
        const toolCalls = Array.isArray(message?.tool_calls)
          ? message.tool_calls
          : []

        if (!toolCalls.length) {
          return withAggregatedUsage(response, aggregatedUsage)
        }

        completionOptions.onToolCallMessage?.(message)

        const sanitizedAssistantMessage: ProviderMessage = {
          role: message.role || "assistant",
          content: sanitizeAssistantContent(message),
          tool_calls: toolCalls,
        }

        const followUpMessages: ProviderMessage[] = [
          ...(currentRequest.messages || []),
          sanitizedAssistantMessage,
        ]

        const toolMessages: ProviderMessage[] = []

        for (const toolCall of toolCalls) {
          const toolName = String(toolCall?.function?.name || "")
          if (isToolSelectName(toolName)) {
            const dynamic = completionOptions?.dynamicToolSelection
            if (!dynamic?.enabled) {
              const toolMessage: ProviderMessage = {
                role: "tool",
                tool_call_id: toolCall.id,
                content: "Error: dynamic tool selection is not available",
                metadata: { toolName },
              }
              completionOptions.onToolResultMessage?.(toolMessage)
              toolMessages.push(toolMessage)
              continue
            }

            const args = parseToolArgs(toolCall?.function?.arguments)
            const need = typeof args?.need === "string" ? args.need.trim() : ""
            const candidates = Array.isArray(dynamic?.candidates)
              ? dynamic.candidates
              : []

            let selected: string[] = []
            try {
              selected = await dynamic.selectToolNames(need, candidates)
            } catch (error) {
              const toolMessage: ProviderMessage = {
                role: "tool",
                tool_call_id: toolCall.id,
                content: `Error: ${(error as Error).message}`,
                metadata: { toolName, need },
              }
              completionOptions.onToolResultMessage?.(toolMessage)
              toolMessages.push(toolMessage)
              continue
            }

            const nextToolNames = Array.from(
              new Set([TOOL_SELECT_NAME, ...selected].filter(Boolean)),
            )
            if (typeof dynamic.setActiveToolFilter === "function") {
              try {
                dynamic.setActiveToolFilter(nextToolNames)
              } catch {
                // ignore filter failures; tool execution will validate allowlist later.
              }
            }

            const toolMessage: ProviderMessage = {
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ tool_names: selected }, null, 2),
              metadata: { toolName, selectedToolNames: selected, need },
            }
            completionOptions.onToolResultMessage?.(toolMessage)
            toolMessages.push(toolMessage)
            continue
          }

          try {
            const result = await options.executeToolCall(toolCall)
            const contentText = serializeToolResult(result)

            const toolMessage: ProviderMessage = {
              role: "tool",
              tool_call_id: toolCall.id,
              content: contentText,
              metadata: {
                toolName: toolCall.function?.name,
                toolArgs: toolCall.function?.arguments,
              },
            }

            completionOptions.onToolResultMessage?.(toolMessage)
            toolMessages.push(toolMessage)
          } catch (error) {
            const errorText = `Error: ${(error as Error).message}`
            const toolMessage: ProviderMessage = {
              role: "tool",
              tool_call_id: toolCall.id,
              content: errorText,
              metadata: {
                toolName: toolCall.function?.name,
                toolArgs: toolCall.function?.arguments,
                error: (error as Error).message,
              },
            }
            completionOptions.onToolResultMessage?.(toolMessage)
            toolMessages.push(toolMessage)
          }
        }

        followUpMessages.push(...toolMessages)

        const continuationResponseId = supportsPreviousResponseId(currentRequest)
          ? extractResponsesContinuationId(response)
          : ""
        const continuationMessages = continuationResponseId
          ? [
              ...(currentRequest.messages || []).filter(isInstructionMessage),
              ...toolMessages,
            ]
          : followUpMessages

        currentRequest = {
          ...currentRequest,
          messages: continuationMessages,
          ...(continuationResponseId
            ? { previous_response_id: continuationResponseId }
            : { previous_response_id: undefined }),
        }
      }
    },
  })
}
