import type { BotRuntimeConfig } from "./config"
import type { TelegramMessage, TelegramUser } from "./telegram"

function normalizeIdentity(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase()
}

function buildUserCandidates(user?: TelegramUser) {
  const candidates: string[] = []
  if (typeof user?.id === "number") {
    candidates.push(String(user.id))
  }
  if (typeof user?.username === "string" && user.username.trim()) {
    candidates.push(normalizeIdentity(user.username))
  }
  return candidates
}

function isUserListed(entries: string[], user?: TelegramUser) {
  if (!entries.length) return true
  const normalizedEntries = new Set(entries.map(normalizeIdentity))
  return buildUserCandidates(user).some((candidate) =>
    normalizedEntries.has(candidate),
  )
}

export function isAdminUser(config: BotRuntimeConfig, user?: TelegramUser) {
  const adminUsers = config.telegram.adminUsers || []
  if (!adminUsers.length) return false
  return isUserListed(adminUsers, user)
}

export function authorizeMessage(
  config: BotRuntimeConfig,
  message: TelegramMessage,
) {
  const allowedChats = config.telegram.allowedChats || []
  if (allowedChats.length && !allowedChats.includes(message.chat.id)) {
    return {
      ok: false,
      reason: "chat_not_allowed",
      replyText: "当前群组或会话未授权，无法继续处理消息。",
    }
  }

  const allowedUsers = config.telegram.allowedUsers || []
  if (!isUserListed(allowedUsers, message.from)) {
    return {
      ok: false,
      reason: "user_not_allowed",
      replyText: "你当前不在允许列表中，无法触发 bot 的工具或对话能力。",
    }
  }

  return { ok: true as const }
}

function isReplyToBot(message: TelegramMessage, botUsername: string) {
  const repliedUser = message.reply_to_message?.from
  if (!repliedUser) return false
  const repliedUsername =
    typeof repliedUser.username === "string"
      ? normalizeIdentity(repliedUser.username)
      : ""
  return repliedUsername === normalizeIdentity(botUsername)
}

function mentionsBot(message: TelegramMessage, botUsername: string) {
  const text = [message.text, message.caption]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .toLowerCase()
  if (!text) return false
  return text.includes(`@${normalizeIdentity(botUsername)}`)
}

export function extractCommandText(message: TelegramMessage) {
  const text =
    typeof message.text === "string"
      ? message.text.trim()
      : typeof message.caption === "string"
        ? message.caption.trim()
        : ""
  return text.startsWith("/") ? text : ""
}

export function shouldRespondToMessage(
  config: BotRuntimeConfig,
  message: TelegramMessage,
  botUsername: string,
) {
  return evaluateMessageHandling(config, message, botUsername).shouldReply
}

export function evaluateMessageHandling(
  config: BotRuntimeConfig,
  message: TelegramMessage,
  botUsername: string,
) {
  const chatType = message.chat.type
  if (chatType === "private") {
    return {
      shouldProcess: true,
      shouldReply: true,
      reason: "private" as const,
    }
  }
  if (chatType !== "group" && chatType !== "supergroup") {
    return {
      shouldProcess: false,
      shouldReply: false,
      reason: "unsupported_chat" as const,
    }
  }

  const commandText = extractCommandText(message)
  const isAdminCommand = Boolean(
    commandText &&
      config.telegram.groupResponseMode.allowAdminCommands &&
      isAdminUser(config, message.from),
  )
  const isMentioned = mentionsBot(message, botUsername)
  const isReplyingToBot = isReplyToBot(message, botUsername)

  if (!config.telegram.groupResponseMode.onlyWhenMentioned) {
    return {
      shouldProcess: true,
      shouldReply: isAdminCommand || isMentioned || isReplyingToBot,
      reason: isAdminCommand
        ? ("admin_command" as const)
        : isMentioned
          ? ("mention" as const)
          : isReplyingToBot
            ? ("reply_to_bot" as const)
            : ("passive_group" as const),
    }
  }

  if (
    isAdminCommand
  ) {
    return {
      shouldProcess: true,
      shouldReply: true,
      reason: "admin_command" as const,
    }
  }

  if (isMentioned) {
    return {
      shouldProcess: true,
      shouldReply: true,
      reason: "mention" as const,
    }
  }

  if (
    config.telegram.groupResponseMode.allowReplyToBot &&
    isReplyingToBot
  ) {
    return {
      shouldProcess: true,
      shouldReply: true,
      reason: "reply_to_bot" as const,
    }
  }

  return {
    shouldProcess: false,
    shouldReply: false,
    reason: "ignored_group" as const,
  }
}
