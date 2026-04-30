import type { ChatMessageLike } from "./types"

export function isToolInvocationNotice(message: ChatMessageLike): boolean {
  if (!message || message.role !== "assistant" || !message.metadata?.hasToolCalls) {
    return false
  }

  const metadataReasoning =
    typeof message.metadata?.reasoning === "string" ? message.metadata.reasoning : ""
  const metadataReasoningContent =
    typeof message.metadata?.reasoning_content === "string"
      ? message.metadata.reasoning_content
      : ""
  const reasoningText = (
    message.reasoning_content ||
    metadataReasoning ||
    metadataReasoningContent ||
    ""
  ).trim()

  if (reasoningText) {
    return false
  }

  const text = String(message.content || "").trim()
  if (!text) {
    return true
  }

  const pattern = /\[Tool\s+\d+:[^\]]+\]/g
  const matches = text.match(pattern)
  if (!matches) {
    return false
  }

  const remaining = text.replace(pattern, "").trim()
  if (remaining.length > 0) {
    return false
  }

  if (message.metadata?.toolInvocationOnly) {
    return true
  }

  return true
}
