import type { TelegramMessage, TelegramSendMessageOptions } from "./telegram"

export function buildReplyOptions(
  message: TelegramMessage,
  options: { forceQuote?: boolean } = {},
): TelegramSendMessageOptions {
  const replyOptions: TelegramSendMessageOptions = {}
  if (typeof message.message_thread_id === "number") {
    replyOptions.messageThreadId = message.message_thread_id
  }
  const shouldQuote =
    options.forceQuote === true ||
    (message.chat.type !== "private" && typeof message.message_id === "number")
  if (shouldQuote) {
    replyOptions.replyToMessageId = message.message_id
  }
  return replyOptions
}
