import type { Capability } from "../capability.js"
import type { ProviderChatCompletionRequest, ProviderMessage } from "../types.js"
import { splitGeminiThoughtTaggedContent } from "../../vendors/googleGemini.js"

export interface ToolCallingCapabilityOptions {
  getTools: () => Promise<Array<{ type: "function"; function: any }>>
  executeToolCall: (toolCall: any) => Promise<any>
}

const TOOL_SELECT_NAME = "SelectTools"
const TOOL_SELECT_CANDIDATES = new Set([TOOL_SELECT_NAME, `myz-local:${TOOL_SELECT_NAME}`])

function isToolSelectName(rawName: unknown) {
  const name = typeof rawName === "string" ? rawName : ""
  if (!name) return false
  if (TOOL_SELECT_CANDIDATES.has(name)) return true
  if (name.includes(":") && name.split(":").pop() === TOOL_SELECT_NAME) {
    return true
  }
  return false
}

function sanitizeAssistantContent(message: any) {
  const rawContent = message?.content
  const rawThoughtFlag = Boolean(message?.extra_content?.google?.thought)

  if (typeof rawContent !== "string") {
    return ""
  }

  if (rawThoughtFlag && !rawContent.includes("<thought>")) {
    return ""
  }

  return splitGeminiThoughtTaggedContent(rawContent).text || ""
}

function parseToolArgs(raw: any) {
  if (raw == null) return {}
  if (typeof raw === "object") return raw
  if (typeof raw !== "string") return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function serializeToolResult(result: any) {
  if (typeof result === "string") {
    return result
  }

  if (result?.content && Array.isArray(result.content)) {
    return result.content
      .filter((c: any) => c?.type === "text")
      .map((c: any) => c.text)
      .join("\n")
  }

  try {
    return JSON.stringify(result)
  } catch {
    return String(result)
  }
}

export function createToolCallingCapability(
  options: ToolCallingCapabilityOptions,
): Capability {
  return (client) => ({
    async createCompletion(request, completionOptions: any = {}) {
      let currentRequest: ProviderChatCompletionRequest = {
        ...request,
      }

      const toolingOverrides = completionOptions?.tooling || null
      const toolChoice = toolingOverrides?.toolChoice
      const parallelToolCalls = toolingOverrides?.parallelToolCalls
      const strictSchema =
        typeof toolingOverrides?.strict === "boolean" ? toolingOverrides.strict : undefined

      while (true) {
        const rawTools = await options.getTools()
        const tools =
          typeof strictSchema === "boolean"
            ? rawTools.map((tool: any) => {
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
        const message = response?.choices?.[0]?.message as any
        const toolCalls = Array.isArray(message?.tool_calls)
          ? message.tool_calls
          : []

        if (!toolCalls.length) {
          return response
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
            try {
              dynamic.setActiveToolFilter(nextToolNames)
            } catch {
              // ignore filter failures; tool execution will validate allowlist later.
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

        currentRequest = {
          ...currentRequest,
          messages: followUpMessages,
        }
      }
    },
  })
}
