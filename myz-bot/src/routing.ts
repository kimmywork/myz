import type { ChatMessage } from "./chatChannel"

function buildDisplayName(message: ChatMessage) {
  const username = message.from?.username ? `@${message.from.username}` : ""
  const fullName = [message.from?.firstName, message.from?.lastName]
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

export interface SessionRoute {
  sessionId: string
  actorUserId: number
  actorDisplayName: string
  scope: "private" | "group"
  threadId?: number
}

export function resolveSessionRoute(
  message: ChatMessage,
): SessionRoute {
  const actorUserId = message.from?.id || message.chat.id
  const actorDisplayName = buildDisplayName(message)
  const chatType = message.chat.type

  if (chatType === "group" || chatType === "supergroup") {
    if (typeof message.threadId === "number") {
      return {
        sessionId: `${message.chat.id}-thread-${message.threadId}`,
        actorUserId,
        actorDisplayName,
        scope: "group",
        threadId: message.threadId,
      }
    }
    return {
      sessionId: `${message.chat.id}-group`,
      actorUserId,
      actorDisplayName,
      scope: "group",
    }
  }

  return {
    sessionId: `${message.chat.id}-${actorUserId}`,
    actorUserId,
    actorDisplayName,
    scope: "private",
  }
}
