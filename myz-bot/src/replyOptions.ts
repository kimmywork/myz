import type { ChatMessage, ChatSendMessageOptions } from "./chatChannel"

export function buildReplyOptions(
  message: ChatMessage,
  options: { forceQuote?: boolean } = {},
): ChatSendMessageOptions {
  const replyOptions: ChatSendMessageOptions = {}
  if (typeof message.threadId === "number") {
    replyOptions.messageThreadId = message.threadId
  }
  const shouldQuote =
    options.forceQuote === true ||
    (message.chat.type !== "private" && typeof message.messageId === "number")
  if (shouldQuote) {
    replyOptions.replyToMessageId = message.messageId
  }
  return replyOptions
}
