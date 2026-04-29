import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { getTelegramHistoryPath } from "./conversations"
import type { ChatMessage } from "./chatChannel"

export type TelegramHistoryKind =
  | "conversation"
  | "command"
  | "scheduler"
  | "progress"
  | "relay"
  | "error"

export interface TelegramHistoryEntry {
  schemaVersion: string
  entryId: string
  conversationId: string
  chatId: number
  telegramMessageId: number
  direction: "inbound" | "outbound"
  speaker: "user" | "assistant"
  kind: TelegramHistoryKind
  text: string
  timestamp: string
  messageThreadId?: number
  replyToTelegramMessageId?: number
  actorUserId?: number
  actorDisplayName?: string
  username?: string
}

const SCHEMA_VERSION = "1.0.0"

function ensureTelegramHistoryFile(conversationDir: string) {
  mkdirSync(resolve(conversationDir, "context"), { recursive: true })
  const path = getTelegramHistoryPath(conversationDir)
  if (!existsSync(path)) {
    writeFileSync(path, "")
  }
  return path
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
}

function readEntries(conversationDir: string) {
  const path = ensureTelegramHistoryFile(conversationDir)
  const raw = readFileSync(path, "utf-8").trim()
  if (!raw) return [] as TelegramHistoryEntry[]
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TelegramHistoryEntry)
}

export function loadTelegramHistory(conversationDir: string) {
  return readEntries(conversationDir)
}

function hasTelegramMessageId(
  conversationDir: string,
  direction: TelegramHistoryEntry["direction"],
  telegramMessageId: number,
) {
  const entries = readEntries(conversationDir)
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (!entry) continue
    if (entry.direction === direction && entry.telegramMessageId === telegramMessageId) {
      return true
    }
  }
  return false
}

function appendTelegramHistoryEntry(
  conversationDir: string,
  entry: TelegramHistoryEntry,
) {
  if (hasTelegramMessageId(conversationDir, entry.direction, entry.telegramMessageId)) {
    return false
  }
  const path = ensureTelegramHistoryFile(conversationDir)
  appendFileSync(path, `${JSON.stringify(entry)}\n`)
  return true
}

function buildEntryId(direction: "inbound" | "outbound", telegramMessageId: number) {
  return `${direction}:${telegramMessageId}`
}

function extractText(message: ChatMessage) {
  return normalizeText(message.text || message.caption || "")
}

function extractActorDisplayName(message: ChatMessage) {
  const username = message.from?.username
  const fullName = [message.from?.firstName, message.from?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim()
  if (fullName && username) {
    return `${fullName} (@${username})`
  }
  if (fullName) return fullName
  if (username) return `@${username}`
  return ""
}

export function recordIncomingTelegramMessage(options: {
  conversationDir: string
  conversationId: string
  message: ChatMessage
  kind: TelegramHistoryKind
}) {
  const text = extractText(options.message)
  if (!text) return false
  return appendTelegramHistoryEntry(options.conversationDir, {
    schemaVersion: SCHEMA_VERSION,
    entryId: buildEntryId("inbound", options.message.messageId),
    conversationId: options.conversationId,
    chatId: options.message.chat.id,
    telegramMessageId: options.message.messageId,
    direction: "inbound",
    speaker: "user",
    kind: options.kind,
    text,
    timestamp: new Date(options.message.unixTime * 1000).toISOString(),
    messageThreadId:
      typeof options.message.threadId === "number"
        ? options.message.threadId
        : undefined,
    replyToTelegramMessageId: options.message.replyToMessage?.messageId,
    actorUserId: options.message.from?.id,
    actorDisplayName: extractActorDisplayName(options.message),
    username: options.message.from?.username,
  })
}

export function extractTelegramSentMessages(result: unknown) {
  if (!Array.isArray(result)) return [] as ChatMessage[]
  return result.filter(
    (item): item is ChatMessage =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as ChatMessage).messageId === "number" &&
      Boolean((item as ChatMessage).chat),
  )
}

export function recordOutgoingTelegramMessages(options: {
  conversationDir: string
  conversationId: string
  sendResult: unknown
  kind: TelegramHistoryKind
}) {
  const messages = extractTelegramSentMessages(options.sendResult)
  let recorded = 0
  messages.forEach((message) => {
    const text = extractText(message)
    if (!text) return
    const ok = appendTelegramHistoryEntry(options.conversationDir, {
      schemaVersion: SCHEMA_VERSION,
      entryId: buildEntryId("outbound", message.messageId),
      conversationId: options.conversationId,
      chatId: message.chat.id,
      telegramMessageId: message.messageId,
      direction: "outbound",
      speaker: "assistant",
      kind: options.kind,
      text,
      timestamp: new Date(message.unixTime * 1000).toISOString(),
      messageThreadId:
        typeof message.threadId === "number"
          ? message.threadId
          : undefined,
      replyToTelegramMessageId: message.replyToMessage?.messageId,
      actorUserId: message.from?.id,
      actorDisplayName: extractActorDisplayName(message),
      username: message.from?.username,
    })
    if (ok) {
      recorded += 1
    }
  })
  return recorded
}
