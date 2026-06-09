import type { BotRuntimeConfig } from "./config"
import type { ChatMessage, ChatUser } from "./chatChannel"
import { LOCAL_TUI_CHAT_ID, LOCAL_TUI_USER_ID } from "./tuiChannel"

function normalizeIdentity(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase()
}

function buildUserCandidates(user?: ChatUser) {
  const candidates: string[] = []
  if (typeof user?.id === "number") {
    candidates.push(String(user.id))
  }
  if (typeof user?.username === "string" && user.username.trim()) {
    candidates.push(normalizeIdentity(user.username))
  }
  return candidates
}

export function isAdminUser(_config: BotRuntimeConfig, user?: ChatUser) {
  if (user?.id === LOCAL_TUI_USER_ID) return true
  return false
}

export function authorizeMessage(
  _config: BotRuntimeConfig,
  message: ChatMessage,
) {
  if (message.chat.id === LOCAL_TUI_CHAT_ID) {
    return { ok: true as const }
  }

  return { ok: true as const }
}

export function extractCommandText(message: ChatMessage) {
  const text = message.text || message.caption || ""
  const match = text.match(/^\/(\w+)(?:@\w+)?(?:\s+(.*))?$/s)
  if (!match) return ""
  return text.trim()
}

export function evaluateMessageHandling(
  _config: BotRuntimeConfig,
  message: ChatMessage,
  _botUsername: string,
) {
  if (message.chat.id === LOCAL_TUI_CHAT_ID) {
    return { shouldProcess: true, shouldReply: true }
  }
  return { shouldProcess: true, shouldReply: true }
}
