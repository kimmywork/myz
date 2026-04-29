import { withRetry } from "./retry"
import type {
  ChatAction,
  ChatChannelClient,
  ChatDocument,
  ChatFile,
  ChatForwardOrigin,
  ChatMediaClient,
  ChatMessage,
  ChatPhoto,
  ChatReactionEmoji,
  ChatSendMessageOptions,
  ChatUpdate,
  ChatUser,
  ChatVoice,
  PollingChatInputClient,
} from "./chatChannel"
import { CHAT_REACTION_EMOJIS } from "./chatChannel"

export interface TelegramUser {
  id: number
  username?: string
  first_name?: string
  last_name?: string
}

export interface TelegramChat {
  id: number
  type: string
  title?: string
}

export interface TelegramPhotoSize {
  file_id: string
  file_unique_id?: string
  width?: number
  height?: number
  file_size?: number
}

export interface TelegramDocument {
  file_id: string
  file_unique_id?: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface TelegramVoice {
  file_id: string
  file_unique_id?: string
  duration?: number
  mime_type?: string
  file_size?: number
}

export interface TelegramForwardOrigin {
  type?: string
  sender_user_name?: string
  chat?: {
    id?: number
    title?: string
  }
}

export interface TelegramMessage {
  message_id: number
  date: number
  text?: string
  caption?: string
  from?: TelegramUser
  chat: TelegramChat
  photo?: TelegramPhotoSize[]
  document?: TelegramDocument
  voice?: TelegramVoice
  reply_to_message?: TelegramMessage
  forward_from?: TelegramUser
  forward_origin?: TelegramForwardOrigin
  message_thread_id?: number
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

export interface TelegramFile {
  file_id: string
  file_path?: string
  file_size?: number
}

export interface TelegramClientOptions {
  token: string
  timeoutSeconds?: number
  maxMessageLength?: number
  retry?: {
    retries?: number
    baseDelayMs?: number
  }
}

export type TelegramSendMessageOptions = ChatSendMessageOptions
export type TelegramChatAction = ChatAction
export const TELEGRAM_REACTION_EMOJIS = CHAT_REACTION_EMOJIS
export type TelegramReactionEmoji = ChatReactionEmoji

export interface TelegramClient
  extends ChatChannelClient<ChatMessage>,
    PollingChatInputClient<ChatUpdate, ChatUser>,
    ChatMediaClient<ChatFile> {}

function toChatUser(user: TelegramUser): ChatUser {
  return {
    id: user.id,
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
  }
}

function toChatForwardOrigin(origin?: TelegramForwardOrigin): ChatForwardOrigin | undefined {
  if (!origin) return undefined
  return {
    type: origin.type,
    senderUsername: origin.sender_user_name,
    chat: origin.chat,
  }
}

function toChatPhoto(photo: TelegramPhotoSize): ChatPhoto {
  return {
    fileId: photo.file_id,
    fileUniqueId: photo.file_unique_id,
    width: photo.width,
    height: photo.height,
    fileSize: photo.file_size,
  }
}

function toChatDocument(document: TelegramDocument): ChatDocument {
  return {
    fileId: document.file_id,
    fileUniqueId: document.file_unique_id,
    fileName: document.file_name,
    mimeType: document.mime_type,
    fileSize: document.file_size,
  }
}

function toChatVoice(voice: TelegramVoice): ChatVoice {
  return {
    fileId: voice.file_id,
    fileUniqueId: voice.file_unique_id,
    duration: voice.duration,
    mimeType: voice.mime_type,
    fileSize: voice.file_size,
  }
}

export function toChatMessage(message: TelegramMessage): ChatMessage {
  return {
    messageId: message.message_id,
    unixTime: message.date,
    text: message.text,
    caption: message.caption,
    from: message.from ? toChatUser(message.from) : undefined,
    chat: message.chat,
    photo: message.photo?.map(toChatPhoto),
    document: message.document ? toChatDocument(message.document) : undefined,
    voice: message.voice ? toChatVoice(message.voice) : undefined,
    replyToMessage: message.reply_to_message ? toChatMessage(message.reply_to_message) : undefined,
    forwardFrom: message.forward_from ? toChatUser(message.forward_from) : undefined,
    forwardOrigin: toChatForwardOrigin(message.forward_origin),
    threadId: message.message_thread_id,
  }
}

function toChatUpdate(update: TelegramUpdate): ChatUpdate {
  return {
    updateId: update.update_id,
    message: update.message ? toChatMessage(update.message) : undefined,
  }
}

function toChatFile(file: TelegramFile): ChatFile {
  return {
    fileId: file.file_id,
    filePath: file.file_path,
    fileSize: file.file_size,
  }
}

function shouldRetryTelegramError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /fetch failed|network|timeout|429|5\d\d/i.test(message)
}

function buildUrl(token: string, method: string) {
  return `https://api.telegram.org/bot${token}/${method}`
}

function buildFileUrl(token: string, filePath: string) {
  return `https://api.telegram.org/file/bot${token}/${filePath.replace(/^\/+/, "")}`
}

export function createTelegramClient(
  options: TelegramClientOptions,
): TelegramClient {
  const timeoutSeconds = options.timeoutSeconds ?? 25
  const maxMessageLength = options.maxMessageLength ?? 4000
  const retryOptions = {
    retries: Math.max(0, options.retry?.retries ?? 2),
    baseDelayMs: Math.max(0, options.retry?.baseDelayMs ?? 800),
  }

  function splitMessage(text: string) {
    if (text.length <= maxMessageLength) return [text]
    const parts: string[] = []
    let remaining = text
    while (remaining.length > maxMessageLength) {
      let cut = remaining.lastIndexOf("\n", maxMessageLength)
      if (cut < maxMessageLength * 0.5) {
        cut = maxMessageLength
      }
      parts.push(remaining.slice(0, cut))
      remaining = remaining.slice(cut)
    }
    if (remaining.length) parts.push(remaining)
    return parts
  }

  async function getUpdates(offset: number) {
    return withRetry(
      async () => {
        const url = buildUrl(options.token, "getUpdates")
        const resp = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ offset, timeout: timeoutSeconds }),
        })
        if (!resp.ok) {
          const text = await resp.text()
          throw new Error(`Telegram getUpdates failed: ${resp.status} ${text}`)
        }
        const data = (await resp.json()) as { ok: boolean; result?: TelegramUpdate[] }
        if (!data.ok) throw new Error("Telegram getUpdates not ok")
        return (data.result || []).map(toChatUpdate)
      },
      {
        ...retryOptions,
        shouldRetry: shouldRetryTelegramError,
      },
    )
  }

  async function sendMessage(
    chatId: number,
    text: string,
    sendOptions: TelegramSendMessageOptions = {},
  ) {
    return withRetry(
      async () => {
        const url = buildUrl(options.token, "sendMessage")
        const chunks = splitMessage(text)
        const results: ChatMessage[] = []
        for (const chunk of chunks) {
          const payload: Record<string, unknown> = {
            chat_id: chatId,
            text: chunk,
          }
          if (typeof sendOptions.replyToMessageId === "number") {
            payload.reply_parameters = {
              message_id: sendOptions.replyToMessageId,
            }
          }
          if (typeof sendOptions.messageThreadId === "number") {
            payload.message_thread_id = sendOptions.messageThreadId
          }
          const resp = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
          if (!resp.ok) {
            const body = await resp.text()
            throw new Error(`Telegram sendMessage failed: ${resp.status} ${body}`)
          }
          const data = (await resp.json()) as {
            ok: boolean
            result?: TelegramMessage
          }
          if (!data.ok || !data.result) {
            throw new Error("Telegram sendMessage not ok")
          }
          results.push(toChatMessage(data.result))
        }
        return results
      },
      {
        ...retryOptions,
        shouldRetry: shouldRetryTelegramError,
      },
    )
  }

  async function sendChatAction(
    chatId: number,
    action: TelegramChatAction,
    sendOptions: { messageThreadId?: number } = {},
  ) {
    return withRetry(
      async () => {
        const url = buildUrl(options.token, "sendChatAction")
        const payload: Record<string, unknown> = {
          chat_id: chatId,
          action,
        }
        if (typeof sendOptions.messageThreadId === "number") {
          payload.message_thread_id = sendOptions.messageThreadId
        }
        const resp = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!resp.ok) {
          const body = await resp.text()
          throw new Error(`Telegram sendChatAction failed: ${resp.status} ${body}`)
        }
        const data = (await resp.json()) as { ok: boolean }
        if (!data.ok) {
          throw new Error("Telegram sendChatAction not ok")
        }
        return true
      },
      {
        ...retryOptions,
        shouldRetry: shouldRetryTelegramError,
      },
    )
  }

  async function setMessageReaction(
    chatId: number,
    messageId: number,
    reaction: TelegramReactionEmoji | null,
    reactionOptions: { isBig?: boolean } = {},
  ) {
    return withRetry(
      async () => {
        const url = buildUrl(options.token, "setMessageReaction")
        const payload: Record<string, unknown> = {
          chat_id: chatId,
          message_id: messageId,
          reaction: reaction ? [{ type: "emoji", emoji: reaction }] : [],
        }
        if (typeof reactionOptions.isBig === "boolean") {
          payload.is_big = reactionOptions.isBig
        }
        const resp = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!resp.ok) {
          const body = await resp.text()
          throw new Error(`Telegram setMessageReaction failed: ${resp.status} ${body}`)
        }
        const data = (await resp.json()) as { ok: boolean }
        if (!data.ok) {
          throw new Error("Telegram setMessageReaction not ok")
        }
        return true
      },
      {
        ...retryOptions,
        shouldRetry: shouldRetryTelegramError,
      },
    )
  }

  async function getMe() {
    return withRetry(
      async () => {
        const url = buildUrl(options.token, "getMe")
        const resp = await fetch(url, { method: "GET" })
        if (!resp.ok) {
          const body = await resp.text()
          throw new Error(`Telegram getMe failed: ${resp.status} ${body}`)
        }
        const data = (await resp.json()) as { ok: boolean; result?: TelegramUser }
        if (!data.ok || !data.result) {
          throw new Error("Telegram getMe not ok")
        }
        return toChatUser(data.result)
      },
      {
        ...retryOptions,
        shouldRetry: shouldRetryTelegramError,
      },
    )
  }

  async function getFile(fileId: string) {
    return withRetry(
      async () => {
        const url = buildUrl(options.token, "getFile")
        const resp = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ file_id: fileId }),
        })
        if (!resp.ok) {
          const body = await resp.text()
          throw new Error(`Telegram getFile failed: ${resp.status} ${body}`)
        }
        const data = (await resp.json()) as { ok: boolean; result?: TelegramFile }
        if (!data.ok || !data.result) {
          throw new Error("Telegram getFile not ok")
        }
        return toChatFile(data.result)
      },
      {
        ...retryOptions,
        shouldRetry: shouldRetryTelegramError,
      },
    )
  }

  async function downloadFile(filePath: string) {
    return withRetry(
      async () => {
        const url = buildFileUrl(options.token, filePath)
        const resp = await fetch(url, { method: "GET" })
        if (!resp.ok) {
          const body = await resp.text()
          throw new Error(`Telegram downloadFile failed: ${resp.status} ${body}`)
        }
        return resp.arrayBuffer()
      },
      {
        ...retryOptions,
        shouldRetry: shouldRetryTelegramError,
      },
    )
  }

  return {
    getUpdates,
    sendMessage,
    sendChatAction,
    setMessageReaction,
    getMe,
    getFile,
    downloadFile,
  }
}
