import type { Capability } from "../capability.js"
import type { ProviderChatCompletionRequest, ProviderMessage } from "../types.js"
import { splitGeminiThoughtTaggedContent } from "../../vendors/googleGemini.js"

export interface ToolCallingCapabilityOptions {
  getTools: () => Promise<Array<{ type: "function"; function: any }>>
  executeToolCall: (toolCall: any) => Promise<any>
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
      const tools = await options.getTools()
      let currentRequest: ProviderChatCompletionRequest = {
        ...request,
        tools: tools?.length ? tools : request.tools,
      }

      while (true) {
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

        for (const toolCall of toolCalls) {
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
            followUpMessages.push(toolMessage)
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
            followUpMessages.push(toolMessage)
          }
        }

        currentRequest = {
          ...currentRequest,
          messages: followUpMessages,
        }
      }
    },
  })
}
