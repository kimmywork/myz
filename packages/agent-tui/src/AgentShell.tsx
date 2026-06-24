import React, { useEffect, useState } from "react"
import { Box, useApp, useInput, useStdout, useWindowSize } from "ink"
import stringWidth from "string-width"
import { ChatHistory, type ChatEntry } from "./ChatHistory"
import { InputBar } from "./InputBar"
import { StatusBar } from "./StatusBar"
import { isMouseWheelDown, isMouseWheelUp } from "./terminalInput"

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

export function __getTranscriptRowsForTest(entries: ChatEntry[], columns: number) {
  return entries.reduce((total, entry) => total + __estimateEntryRowsForTest(entry, columns), 0)
}

export { isMouseWheelUp as __isMouseWheelUpForTest, isMouseWheelDown as __isMouseWheelDownForTest }

export function __selectVisibleEntriesForTest(entries: ChatEntry[], maxRows: number, columns: number, scrollOffset = 0) {
  if (maxRows <= 0) return []

  const selected: ChatEntry[] = []
  const clampedOffset = Math.max(0, Math.min(scrollOffset, Math.max(0, __getTranscriptRowsForTest(entries, columns) - maxRows)))
  let skippedRows = 0
  let endIndex = entries.length - 1

  while (endIndex >= 0 && skippedRows + __estimateEntryRowsForTest(entries[endIndex], columns) <= clampedOffset) {
    skippedRows += __estimateEntryRowsForTest(entries[endIndex], columns)
    endIndex--
  }

  let usedRows = 0
  for (let i = endIndex; i >= 0; i--) {
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
  const { stdout, write } = useStdout()
  const { rows, columns } = useWindowSize()
  const [scrollOffset, setScrollOffset] = useState(0)
  const frameHeight = Math.max(1, rows - 1)
  const historyRows = Math.max(1, frameHeight - 4 - 3)
  const maxScrollOffset = Math.max(0, __getTranscriptRowsForTest(entries, columns) - historyRows)
  const visibleEntries = __selectVisibleEntriesForTest(entries, historyRows, columns, scrollOffset)
  const pageScrollRows = Math.max(1, Math.ceil(historyRows / 4))
  const wheelScrollRows = Math.max(1, Math.ceil(historyRows / 8))

  useEffect(() => {
    setScrollOffset((current) => Math.min(current, maxScrollOffset))
  }, [maxScrollOffset])

  useEffect(() => {
    if (!stdout.isTTY) return
    write("\x1B[?1000h\x1B[?1002h\x1B[?1003h\x1B[?1006h\x1B[?1007h")
    return () => { write("\x1B[?1007l\x1B[?1006l\x1B[?1003l\x1B[?1002l\x1B[?1000l") }
  }, [stdout, write])

  useInput((input, key) => {
    if (key.ctrl && input === "c") exit()
    if (key.pageUp) setScrollOffset((current) => Math.min(maxScrollOffset, current + pageScrollRows))
    if (key.pageDown) setScrollOffset((current) => Math.max(0, current - pageScrollRows))
    if (isMouseWheelUp(input)) setScrollOffset((current) => Math.min(maxScrollOffset, current + wheelScrollRows))
    if (isMouseWheelDown(input)) setScrollOffset((current) => Math.max(0, current - wheelScrollRows))
    if (key.home) setScrollOffset(maxScrollOffset)
    if (key.end) setScrollOffset(0)
  })

  return (
    <Box flexDirection="column" width="100%" height={frameHeight}>
      <Box flexDirection="column" flexGrow={1} justifyContent="flex-end" overflow="hidden">
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
