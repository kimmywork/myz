import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs"
import { resolve } from "node:path"
import { AI_SCHEMA_VERSION } from "@myz/shared/versioning"
import type { Message } from "@myz/ai-core/types"

export interface ConversationMetadata {
  schemaVersion: string
  conversationId: string
  chatId: number
  userId: number
  scope?: "private" | "group"
  chatType?: string
  threadId?: number
  username?: string
  firstName?: string
  lastName?: string
  title?: string
  createdAt: string
  updatedAt: string
  lastMessageAt?: string
  lastCompressionAt?: string
  lastActorUserId?: number
  lastActorDisplayName?: string
}

export function ensureConversationDir(
  conversationsDir: string,
  conversationId: string,
) {
  const dir = resolve(conversationsDir, conversationId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function loadMetadata(dir: string): ConversationMetadata | null {
  const path = resolve(dir, "metadata.json")
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, "utf-8")) as ConversationMetadata
}

export function saveMetadata(dir: string, meta: ConversationMetadata) {
  const path = resolve(dir, "metadata.json")
  writeFileSync(path, JSON.stringify(meta, null, 2))
}

export function getLegacyHistoryPath(dir: string) {
  return resolve(dir, "history.jsonl")
}

export function getLlmHistoryPath(dir: string) {
  return resolve(dir, "llm-history.jsonl")
}

export function getLlmTracePath(dir: string) {
  return resolve(dir, "llm-trace.jsonl")
}

export function getTelegramHistoryPath(dir: string) {
  return resolve(dir, "telegram-history.jsonl")
}

function appendJsonl<T>(path: string, entry: T) {
  appendFileSync(path, JSON.stringify(entry) + "\n")
}

function loadJsonl<T>(path: string) {
  if (!existsSync(path)) return []
  return readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

function writeJsonl<T>(path: string, entries: T[]) {
  const content =
    entries.length > 0
      ? `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`
      : ""
  writeFileSync(path, content)
}

function getReadableLlmHistoryPath(dir: string) {
  const llmPath = getLlmHistoryPath(dir)
  if (existsSync(llmPath)) return llmPath
  const legacyPath = getLegacyHistoryPath(dir)
  return existsSync(legacyPath) ? legacyPath : llmPath
}

function ensureWritableLlmHistoryPath(dir: string) {
  const llmPath = getLlmHistoryPath(dir)
  if (!existsSync(llmPath)) {
    const legacyPath = getLegacyHistoryPath(dir)
    if (existsSync(legacyPath)) {
      writeFileSync(llmPath, readFileSync(legacyPath, "utf-8"))
    }
  }
  return llmPath
}

export function appendMessage(dir: string, message: Message) {
  appendJsonl(ensureWritableLlmHistoryPath(dir), message)
}

export function appendTraceMessage(dir: string, message: Message) {
  appendJsonl(getLlmTracePath(dir), message)
}

export function rewriteLlmHistory(dir: string, messages: Message[]) {
  writeJsonl(ensureWritableLlmHistoryPath(dir), messages)
}

export function loadMessages(dir: string, limit = 40): Message[] {
  const path = getReadableLlmHistoryPath(dir)
  const lines = loadJsonl<Message>(path)
  return lines.slice(-limit)
}

export function loadAllMessages(dir: string): Message[] {
  return loadJsonl<Message>(getReadableLlmHistoryPath(dir))
}

export function loadAllTraceMessages(dir: string): Message[] {
  return loadJsonl<Message>(getLlmTracePath(dir))
}

export function loadLatestSystemMessage(dir: string): Message | null {
  const path = getReadableLlmHistoryPath(dir)
  if (!existsSync(path)) return null
  const lines = readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (!line) continue
    try {
      const message = JSON.parse(line) as Message
      if (message.role === "system") return message
    } catch {
      continue
    }
  }
  return null
}

export function createUserMessage(
  conversationId: string,
  content: string,
  metadata: Message["metadata"] = {},
): Message {
  return {
    schemaVersion: AI_SCHEMA_VERSION,
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    conversationId,
    role: "user",
    content,
    timestamp: new Date().toISOString(),
    metadata,
  }
}

export function createAssistantMessage(
  conversationId: string,
  content: string,
  metadata: Message["metadata"] = {},
): Message {
  return {
    schemaVersion: AI_SCHEMA_VERSION,
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    conversationId,
    role: "assistant",
    content,
    timestamp: new Date().toISOString(),
    metadata,
  }
}

export function createSystemMessage(
  conversationId: string,
  content: string,
  metadata: Message["metadata"] = {},
): Message {
  return {
    schemaVersion: AI_SCHEMA_VERSION,
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    conversationId,
    role: "system",
    content,
    timestamp: new Date().toISOString(),
    metadata,
  }
}

export function createToolMessage(
  conversationId: string,
  content: string,
  toolCallId: string,
  metadata: Message["metadata"] = {},
): Message {
  return {
    schemaVersion: AI_SCHEMA_VERSION,
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    conversationId,
    role: "tool",
    content,
    tool_call_id: toolCallId,
    timestamp: new Date().toISOString(),
    metadata,
  }
}
