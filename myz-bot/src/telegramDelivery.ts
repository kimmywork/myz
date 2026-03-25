import type { TelegramClient, TelegramSendMessageOptions } from "./telegram"
import {
  recordOutgoingTelegramMessages,
  type TelegramHistoryKind,
} from "./telegramHistory"

export async function sendRecordedTelegramMessage(options: {
  telegram: TelegramClient
  conversationDir: string
  conversationId: string
  chatId: number
  text: string
  sendOptions?: TelegramSendMessageOptions
  kind: TelegramHistoryKind
}) {
  const result = await options.telegram.sendMessage(
    options.chatId,
    options.text,
    options.sendOptions,
  )
  recordOutgoingTelegramMessages({
    conversationDir: options.conversationDir,
    conversationId: options.conversationId,
    sendResult: result,
    kind: options.kind,
  })
  return result
}
