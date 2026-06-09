import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { AI_SCHEMA_VERSION } from "@myz/shared/versioning"
import type { Message } from "@myz/ai-core/types"

export interface SessionMetadata {
  schemaVersion: string
  sessionId: string
  workspaceId: string
  chatId?: number
  userId?: number
  username?: string
  firstName?: string
  lastName?: string
  parentSessionId?: string
  forkedFromMessageId?: string
  title?: string
  createdAt: string
  updatedAt: string
  lastMessageAt?: string
  lastCompactionAt?: string
  messageCount: number
  status: "active" | "archived"
}

export function generateSessionId(): string {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return `s-${ts}-${rand}`
}

export function ensureSessionDir(
  sessionsDir: string,
  sessionId: string,
): string {
  const dir = resolve(sessionsDir, sessionId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function loadSessionMetadata(dir: string): SessionMetadata | null {
  const path = resolve(dir, "metadata.json")
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, "utf-8")) as SessionMetadata
}

export function saveSessionMetadata(dir: string, meta: SessionMetadata) {
  const path = resolve(dir, "metadata.json")
  writeFileSync(path, JSON.stringify(meta, null, 2))
}

export function getSessionHistoryPath(dir: string) {
  return resolve(dir, "session-history.jsonl")
}

export function getSessionTracePath(dir: string) {
  return resolve(dir, "session-trace.jsonl")
}

function appendJsonl<T>(path: string, entry: T) {
  appendFileSync(path, JSON.stringify(entry) + "\n")
}

function loadJsonl<T>(path: string): T[] {
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

export function appendMessage(dir: string, message: Message) {
  appendJsonl(getSessionHistoryPath(dir), message)
}

export function appendTraceMessage(dir: string, message: Message) {
  appendJsonl(getSessionTracePath(dir), message)
}

export function rewriteSessionHistory(dir: string, messages: Message[]) {
  writeJsonl(getSessionHistoryPath(dir), messages)
}

export function loadMessages(dir: string, limit = 40): Message[] {
  const lines = loadJsonl<Message>(getSessionHistoryPath(dir))
  return lines.slice(-limit)
}

export function loadAllMessages(dir: string): Message[] {
  return loadJsonl<Message>(getSessionHistoryPath(dir))
}

export function loadLatestSystemMessage(dir: string): Message | null {
  const path = getSessionHistoryPath(dir)
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
  sessionId: string,
  content: string,
  metadata: Message["metadata"] = {},
): Message {
  return {
    schemaVersion: AI_SCHEMA_VERSION,
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    conversationId: sessionId,
    role: "user",
    content,
    timestamp: new Date().toISOString(),
    metadata,
  }
}

export function createAssistantMessage(
  sessionId: string,
  content: string,
  metadata: Message["metadata"] = {},
): Message {
  return {
    schemaVersion: AI_SCHEMA_VERSION,
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    conversationId: sessionId,
    role: "assistant",
    content,
    timestamp: new Date().toISOString(),
    metadata,
  }
}

export function createSystemMessage(
  sessionId: string,
  content: string,
  metadata: Message["metadata"] = {},
): Message {
  return {
    schemaVersion: AI_SCHEMA_VERSION,
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    conversationId: sessionId,
    role: "system",
    content,
    timestamp: new Date().toISOString(),
    metadata,
  }
}

export function createToolMessage(
  sessionId: string,
  content: string,
  toolCallId: string,
  metadata: Message["metadata"] = {},
): Message {
  return {
    schemaVersion: AI_SCHEMA_VERSION,
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    conversationId: sessionId,
    role: "tool",
    content,
    timestamp: new Date().toISOString(),
    tool_call_id: toolCallId,
    metadata,
  }
}

export function createSession(
  sessionsDir: string,
  workspaceId: string,
  options?: {
    parentSessionId?: string
    forkedFromMessageId?: string
    title?: string
  },
): SessionMetadata {
  const sessionId = generateSessionId()
  const now = new Date().toISOString()
  const dir = ensureSessionDir(sessionsDir, sessionId)
  const metadata: SessionMetadata = {
    schemaVersion: "1.0.0",
    sessionId,
    workspaceId,
    parentSessionId: options?.parentSessionId,
    forkedFromMessageId: options?.forkedFromMessageId,
    title: options?.title,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
    messageCount: 0,
    status: "active",
  }
  saveSessionMetadata(dir, metadata)
  return metadata
}

export function forkSession(
  sessionsDir: string,
  sourceSessionId: string,
  forkAtMessageId: string,
  workspaceId: string,
): SessionMetadata | null {
  const sourceDir = resolve(sessionsDir, sourceSessionId)
  if (!existsSync(sourceDir)) return null

  const sourceMessages = loadAllMessages(sourceDir)
  const forkIndex = sourceMessages.findIndex((m) => m.id === forkAtMessageId)
  if (forkIndex < 0) return null

  const messagesToFork = sourceMessages.slice(0, forkIndex + 1)
  const newSession = createSession(sessionsDir, workspaceId, {
    parentSessionId: sourceSessionId,
    forkedFromMessageId: forkAtMessageId,
    title: `Fork of ${sourceSessionId}`,
  })

  const newDir = resolve(sessionsDir, newSession.sessionId)
  writeJsonl(resolve(newDir, "session-history.jsonl"), messagesToFork)
  newSession.messageCount = messagesToFork.length
  saveSessionMetadata(newDir, newSession)

  return newSession
}

export function listSessions(
  sessionsDir: string,
  options?: {
    status?: "active" | "archived"
    limit?: number
  },
): SessionMetadata[] {
  if (!existsSync(sessionsDir)) return []
  const entries = readdirSync(sessionsDir, { withFileTypes: true })
  const sessions: SessionMetadata[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = resolve(sessionsDir, entry.name)
    const meta = loadSessionMetadata(dir)
    if (!meta) continue
    if (options?.status && meta.status !== options.status) continue
    sessions.push(meta)
  }

  sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  if (options?.limit) {
    return sessions.slice(0, options.limit)
  }
  return sessions
}

export function getActiveSession(
  sessionsDir: string,
  workspaceId: string,
): SessionMetadata | null {
  const sessions = listSessions(sessionsDir, { status: "active" })
  return sessions.find((s) => s.workspaceId === workspaceId) || null
}

export function archiveSession(sessionsDir: string, sessionId: string): boolean {
  const dir = resolve(sessionsDir, sessionId)
  if (!existsSync(dir)) return false
  const meta = loadSessionMetadata(dir)
  if (!meta) return false
  meta.status = "archived"
  meta.updatedAt = new Date().toISOString()
  saveSessionMetadata(dir, meta)
  return true
}
