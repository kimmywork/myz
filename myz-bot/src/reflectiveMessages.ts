import type { Message } from "@myz/ai-core/types"

const NON_REFLECTIVE_MESSAGE_TYPES = new Set([
  "tool_audit",
  "tool_progress",
  "scheduled_task_trigger",
  "scheduled_task_reply",
  "relayed_request",
  "outbound_relay",
])

function getMessageType(message: Message) {
  const rawType = message.metadata?.type
  return typeof rawType === "string" ? rawType : ""
}

export function isReflectiveVisibleMessage(message: Message) {
  const type = getMessageType(message)
  if (NON_REFLECTIVE_MESSAGE_TYPES.has(type)) {
    return false
  }
  if (message.role === "user") return true
  if (message.role !== "assistant") return false
  return true
}

export function filterReflectiveVisibleMessages(messages: Message[]) {
  return messages.filter(isReflectiveVisibleMessage)
}

export function countReflectiveVisibleMessages(messages: Message[]) {
  return filterReflectiveVisibleMessages(messages).length
}
