import type { Message, MessageInPayload } from "../types.js"
import { PromptBuilder } from "./builder.js"

function appendStoredMessage(builder: PromptBuilder, message: Message) {
  const content = typeof message?.content === "string" ? message.content : ""

  switch (message?.role) {
    case "system":
      builder.addSystem(content)
      return
    case "user":
      builder.addUser(content)
      return
    case "assistant":
      builder.addAssistant(content, message.tool_calls)
      return
    case "tool":
      if (message.tool_call_id) {
        builder.addTool(content, message.tool_call_id)
      } else {
        builder.addMessage({ role: "tool", content })
      }
      return
    default:
      builder.addMessage({ role: "user", content })
  }
}

export function buildConversationPromptMessages(
  messages: Message[] = [],
): MessageInPayload[] {
  const builder = new PromptBuilder()
  messages.forEach((message) => appendStoredMessage(builder, message))
  return builder.build()
}

