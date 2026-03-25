import type { TelegramMessage } from "./telegram"

function buildDisplayName(message: TelegramMessage) {
  const username = message.from?.username ? `@${message.from.username}` : ""
  const fullName = [message.from?.first_name, message.from?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim()
  if (fullName && username) {
    return `${fullName} (${username})`
  }
  if (fullName) return fullName
  if (username) return username
  if (typeof message.from?.id === "number") {
    return `user:${message.from.id}`
  }
  return "未知成员"
}

export interface ConversationRoute {
  conversationId: string
  actorUserId: number
  actorDisplayName: string
  scope: "private" | "group"
  threadId?: number
}

export function resolveConversationRoute(
  message: TelegramMessage,
): ConversationRoute {
  const actorUserId = message.from?.id || message.chat.id
  const actorDisplayName = buildDisplayName(message)
  const chatType = message.chat.type

  if (chatType === "group" || chatType === "supergroup") {
    if (typeof message.message_thread_id === "number") {
      return {
        conversationId: `${message.chat.id}-thread-${message.message_thread_id}`,
        actorUserId,
        actorDisplayName,
        scope: "group",
        threadId: message.message_thread_id,
      }
    }
    return {
      conversationId: `${message.chat.id}-group`,
      actorUserId,
      actorDisplayName,
      scope: "group",
    }
  }

  return {
    conversationId: `${message.chat.id}-${actorUserId}`,
    actorUserId,
    actorDisplayName,
    scope: "private",
  }
}
