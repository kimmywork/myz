import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

export interface HistoryEntry {
  id: string
  workspaceId: string
  sessionId: string
  timestamp: string
  type: "message" | "tool_call" | "tool_result" | "session_create" | "session_fork" | "session_archive" | "compaction" | "error"
  role?: string
  content?: string
  metadata?: Record<string, unknown>
}

function getHistoryDir(historyRoot: string, workspaceId: string): string {
  const dir = resolve(historyRoot, workspaceId)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getHistoryPath(historyRoot: string, workspaceId: string, sessionId: string): string {
  const dir = getHistoryDir(historyRoot, workspaceId)
  return resolve(dir, `${sessionId}.jsonl`)
}

export function appendHistoryEntry(
  historyRoot: string,
  entry: Omit<HistoryEntry, "id" | "timestamp">,
): void {
  const fullEntry: HistoryEntry = {
    ...entry,
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
  }
  const path = getHistoryPath(historyRoot, entry.workspaceId, entry.sessionId)
  appendFileSync(path, JSON.stringify(fullEntry) + "\n")
}

export function loadSessionHistory(
  historyRoot: string,
  workspaceId: string,
  sessionId: string,
): HistoryEntry[] {
  const path = getHistoryPath(historyRoot, workspaceId, sessionId)
  if (!existsSync(path)) return []
  return readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HistoryEntry)
}

export function listSessionHistories(
  historyRoot: string,
  workspaceId: string,
): string[] {
  const dir = getHistoryDir(historyRoot, workspaceId)
  if (!existsSync(dir)) return []
  const { readdirSync } = require("node:fs")
  return readdirSync(dir)
    .filter((f: string) => f.endsWith(".jsonl"))
    .map((f: string) => f.replace(/\.jsonl$/, ""))
}
