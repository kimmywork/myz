import type { Message } from "@myz/ai-core/types"
import type { ChatMessage } from "./chatChannel"
import type { BotRuntimeConfig } from "./config"
import { resolveConversationRoute } from "./routing"

function buildForwardLabel(message: ChatMessage) {
  if (message.forwardFrom?.username) {
    return `@${message.forwardFrom.username}`
  }
  const origin = message.forwardOrigin
  if (!origin || typeof origin !== "object") return ""
  if (origin.type === "user" && origin.senderUsername) {
    return origin.senderUsername
  }
  if (origin.type === "chat" && origin.chat?.title) {
    return origin.chat.title
  }
  if (origin.type === "channel" && origin.chat?.title) {
    return origin.chat.title
  }
  return ""
}

function summarizeReferencedMessage(message?: ChatMessage) {
  if (!message) return ""
  const speaker =
    message.from?.username
      ? `@${message.from.username}`
      : typeof message.from?.id === "number"
        ? `user:${message.from.id}`
        : ""
  const preview =
    message.text ||
    message.caption ||
    (Array.isArray(message.photo) && message.photo.length
      ? "[图片]"
      : message.document
        ? "[文件]"
        : message.voice
          ? "[语音]"
          : "")
  if (!preview) return ""
  return speaker
    ? `引用消息（${speaker}）：${preview.slice(0, 120)}`
    : `引用消息：${preview.slice(0, 120)}`
}

export async function buildIncomingMessage(options: {
  config: BotRuntimeConfig
  message: ChatMessage
  conversationDir: string
}): Promise<{ content: string; metadata: Message["metadata"] }> {
  const { message } = options
  const route = resolveConversationRoute(message)
  const contentSections: string[] = []
  const metadata: Message["metadata"] = {
    chatId: message.chat.id,
    chatType: message.chat.type,
    actorUserId: route.actorUserId,
    actorDisplayName: route.actorDisplayName,
  }

  if (typeof message.threadId === "number") {
    metadata.messageThreadId = message.threadId
  }

  const forwardedFrom = buildForwardLabel(message)
  if (forwardedFrom) {
    contentSections.push(`转发来源：${forwardedFrom}`)
  }

  const replySummary = summarizeReferencedMessage(message.replyToMessage)
  if (replySummary) {
    contentSections.push(replySummary)
  }

  const text = [message.text, message.caption]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n")
    .trim()
  if (text) {
    contentSections.push(text)
  }

  if (!contentSections.length) {
    contentSections.push("收到一条无文本消息。")
  }

  return {
    content: contentSections.join("\n\n").trim(),
    metadata,
  }
}
