import React from "react"
import { Box, useApp, useInput, useWindowSize } from "ink"
import stringWidth from "string-width"
import { ChatHistory, type ChatEntry } from "./ChatHistory"
import { InputBar } from "./InputBar"
import { StatusBar } from "./StatusBar"

export interface AgentShellProps {
  agentId: string
  sessionId: string
  model: string
  workspace: string
  tokenUsed: number
  tokenTotal: number
  version: string
  entries: ChatEntry[]
  onMessage: (text: string) => void
}

function countWrappedRows(text: string, width: number) {
  const lineWidth = Math.max(1, width)
  return text.split(/\r?\n/).reduce((total, line) => (
    total + Math.max(1, Math.ceil(stringWidth(line || " ") / lineWidth))
  ), 0)
}

export function __estimateEntryRowsForTest(entry: ChatEntry, columns: number) {
  const bodyWidth = Math.max(1, columns - 2)
  const text = entry.expanded && entry.detail ? entry.detail : entry.text
  const bodyRows = text || entry.detail ? countWrappedRows(text || " ", bodyWidth) : 0
  return 1 + bodyRows + 1 // header + body + marginBottom
}

function tailTextToRows(text: string, maxRows: number, columns: number) {
  if (maxRows <= 0) return ""
  const sourceLines = text.split(/\r?\n/)
  const selected: string[] = []
  let rows = 0

  for (let i = sourceLines.length - 1; i >= 0; i--) {
    const line = sourceLines[i]
    const lineRows = countWrappedRows(line || " ", columns)
    if (rows + lineRows > maxRows) break
    selected.unshift(line)
    rows += lineRows
  }

  if (selected.length === sourceLines.length) return text
  return selected.length ? `…\n${selected.join("\n")}` : "…"
}

export function __selectVisibleEntriesForTest(entries: ChatEntry[], maxRows: number, columns: number) {
  if (maxRows <= 0) return []

  const selected: ChatEntry[] = []
  let usedRows = 0

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    const rows = __estimateEntryRowsForTest(entry, columns)
    if (rows <= maxRows - usedRows) {
      selected.unshift(entry)
      usedRows += rows
      continue
    }

    if (selected.length === 0) {
      const bodyBudget = Math.max(1, maxRows - 2)
      selected.unshift({
        ...entry,
        text: tailTextToRows(entry.text, bodyBudget, Math.max(1, columns - 2)),
        detail: entry.expanded && entry.detail ? tailTextToRows(entry.detail, bodyBudget, Math.max(1, columns - 2)) : entry.detail,
      })
    }
    break
  }

  return selected
}

export function AgentShell({
  agentId,
  sessionId,
  model,
  workspace,
  tokenUsed,
  tokenTotal,
  version,
  entries,
  onMessage,
}: AgentShellProps) {
  const { exit } = useApp()
  const { rows, columns } = useWindowSize()
  const frameHeight = Math.max(1, rows - 1)
  const historyRows = Math.max(1, frameHeight - 4 - 3)
  const visibleEntries = __selectVisibleEntriesForTest(entries, historyRows, columns)

  useInput((input, key) => {
    if (key.ctrl && input === "c") exit()
  })

  return (
    <Box flexDirection="column" width="100%" height={frameHeight}>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <ChatHistory entries={visibleEntries} />
      </Box>

      {/* Keep the prompt above the status bar; the status bar remains the bottom line. */}
      <InputBar onSubmit={onMessage} />
      <StatusBar
        workspace={workspace}
        model={model}
        tokenUsed={tokenUsed}
        tokenTotal={tokenTotal}
        agent={agentId}
        version={version}
      />
    </Box>
  )
}
