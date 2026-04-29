export interface ChatSendMessageOptions {
  replyToMessageId?: number
  messageThreadId?: number
}

export interface ChatUser {
  id: number
  username?: string
  firstName?: string
  lastName?: string
}

export interface ChatRoom {
  id: number
  type: string
  title?: string
}

export interface ChatPhoto {
  fileId: string
  fileUniqueId?: string
  width?: number
  height?: number
  fileSize?: number
}

export interface ChatDocument {
  fileId: string
  fileUniqueId?: string
  fileName?: string
  mimeType?: string
  fileSize?: number
}

export interface ChatVoice {
  fileId: string
  fileUniqueId?: string
  duration?: number
  mimeType?: string
  fileSize?: number
}

export interface ChatForwardOrigin {
  type?: string
  senderUsername?: string
  chat?: {
    id?: number
    title?: string
  }
}

export interface ChatMessage {
  messageId: number
  unixTime: number
  text?: string
  caption?: string
  from?: ChatUser
  chat: ChatRoom
  photo?: ChatPhoto[]
  document?: ChatDocument
  voice?: ChatVoice
  replyToMessage?: ChatMessage
  forwardFrom?: ChatUser
  forwardOrigin?: ChatForwardOrigin
  threadId?: number
}

export interface ChatUpdate<TMessage = ChatMessage> {
  updateId: number
  message?: TMessage
}

export interface ChatFile {
  fileId: string
  filePath?: string
  fileSize?: number
}

export type ChatAction =
  | "typing"
  | "upload_photo"
  | "record_video"
  | "upload_video"
  | "record_voice"
  | "upload_voice"
  | "upload_document"
  | "choose_sticker"
  | "find_location"
  | "record_video_note"
  | "upload_video_note"

export const CHAT_REACTION_EMOJIS = [
  "👍",
  "👎",
  "❤",
  "🔥",
  "🥰",
  "👏",
  "😁",
  "🤔",
  "🤯",
  "😱",
  "🤬",
  "😢",
  "🎉",
  "🤩",
  "🤮",
  "💩",
  "🙏",
  "👌",
  "🕊",
  "🤡",
  "🥱",
  "🥴",
  "😍",
  "🐳",
  "❤‍🔥",
  "🌚",
  "🌭",
  "💯",
  "🤣",
  "⚡",
  "🍌",
  "🏆",
  "💔",
  "🤨",
  "😐",
  "🍓",
  "🍾",
  "💋",
  "🖕",
  "😈",
  "😴",
  "😭",
  "🤓",
  "👻",
  "👨‍💻",
  "👀",
  "🎃",
  "🙈",
  "😇",
  "😨",
  "🤝",
  "✍",
  "🤗",
  "🫡",
  "🎅",
  "🎄",
  "☃",
  "💅",
  "🤪",
  "🗿",
  "🆒",
  "💘",
  "🙉",
  "🦄",
  "😘",
  "💊",
  "🙊",
  "😎",
  "👾",
  "🤷‍♂",
  "🤷",
  "🤷‍♀",
  "😡",
] as const

export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number]

export interface ChatChannelClient<TMessage = ChatMessage> {
  sendMessage: (
    chatId: number,
    text: string,
    options?: ChatSendMessageOptions,
  ) => Promise<TMessage[]>
  sendChatAction: (
    chatId: number,
    action: ChatAction,
    options?: { messageThreadId?: number },
  ) => Promise<boolean>
  setMessageReaction: (
    chatId: number,
    messageId: number,
    reaction: ChatReactionEmoji | null,
    options?: { isBig?: boolean },
  ) => Promise<boolean>
}

export interface PollingChatInputClient<TUpdate = ChatUpdate, TUser = ChatUser> {
  getUpdates: (offset: number) => Promise<TUpdate[]>
  getMe: () => Promise<TUser>
}

export interface ChatMediaClient<TFile = ChatFile> {
  getFile: (fileId: string) => Promise<TFile>
  downloadFile: (filePath: string) => Promise<ArrayBuffer>
}