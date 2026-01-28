import type { MessageContent, MessageInPayload, ToolCall } from "../types.js"

export class PromptBuilder {
  private messages: MessageInPayload[]

  constructor(initial: MessageInPayload[] = []) {
    this.messages = [...initial]
  }

  addMessage(message: MessageInPayload) {
    this.messages.push(message)
    return this
  }

  addSystem(content: string) {
    return this.addMessage({ role: "system", content })
  }

  addUser(content: MessageContent) {
    return this.addMessage({ role: "user", content })
  }

  addAssistant(content: string, toolCalls?: ToolCall[]) {
    const message: MessageInPayload = { role: "assistant", content }
    if (Array.isArray(toolCalls) && toolCalls.length) {
      message.tool_calls = toolCalls
    }
    return this.addMessage(message)
  }

  addTool(content: string, toolCallId: string) {
    return this.addMessage({ role: "tool", content, tool_call_id: toolCallId })
  }

  build(): MessageInPayload[] {
    return [...this.messages]
  }

  clear() {
    this.messages = []
    return this
  }
}
