import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs"
import { resolve } from "node:path"
import { AI_SCHEMA_VERSION } from "@myz/shared/versioning"
import type { Message } from "@myz/ai-core/types"

export interface ConversationMetadata {
  schemaVersion: string
  conversationId: string
  chatId: number
  userId: number
  username?: string
  firstName?: string
  lastName?: string
  createdAt: string
  updatedAt: string
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

export function appendMessage(dir: string, message: Message) {
  const path = resolve(dir, "history.jsonl")
  appendFileSync(path, JSON.stringify(message) + "\n")
}

export function loadMessages(dir: string, limit = 40): Message[] {
  const path = resolve(dir, "history.jsonl")
  if (!existsSync(path)) return []
  const lines = readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
  const slice = lines.slice(-limit)
  return slice.map((line) => JSON.parse(line) as Message)
}

export function loadLatestSystemMessage(dir: string): Message | null {
  const path = resolve(dir, "history.jsonl")
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
