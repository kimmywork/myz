import type { Message } from "@myz/ai-core/types"
import {
  countReflectiveVisibleMessages,
  isReflectiveVisibleMessage,
} from "./reflectiveMessages"

export function isSoulDraftVisibleMessage(message: Message) {
  return isReflectiveVisibleMessage(message)
}

export function countSoulDraftVisibleMessages(messages: Message[]) {
  return countReflectiveVisibleMessages(messages)
}

export function shouldTriggerSoulAutoDraft(
  messages: Message[],
  interval: number,
) {
  const safeInterval = Math.max(1, interval)
  const visibleCount = countSoulDraftVisibleMessages(messages)
  return visibleCount > 0 && visibleCount % safeInterval === 0
}
