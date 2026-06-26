import React from "react"
import { Box, Text } from "ink"
import { MarkdownText } from "./MarkdownText"

export type ChatEntryRole =
  | "user"
  | "assistant"
  | "error"
  | "progress"
  | "system"
  | "tool_use"
  | "tool_result"
  | "reasoning"
  | "subagent"
  | "verification"

export interface ChatEntry {
  id?: string
  role: ChatEntryRole
  text: string
  status?: "pending" | "complete"
  detail?: string
  toolName?: string
  subagentId?: string
  expanded?: boolean
  verification?: {
    type: "typecheck" | "test" | "build" | "manual"
    result: "pass" | "fail" | "skip"
    evidence: string
  }
}

function roleLabel(entry: ChatEntry) {
  switch (entry.role) {
    case "user": return { text: "YOU", color: "cyan" as const }
    case "assistant": return { text: "AI", color: "green" as const }
    case "error": return { text: "ERR", color: "red" as const }
    case "tool_use": return { text: "TOOL", color: "yellow" as const }
    case "tool_result": return { text: "RESULT", color: "yellow" as const }
    case "reasoning": return { text: "THINK", color: "gray" as const }
    case "subagent": return { text: "SUB", color: "magenta" as const }
    case "progress": return { text: "…", color: "gray" as const }
    case "system": return { text: "SYS", color: "gray" as const }
    case "verification": return { text: "VERIFY", color: "blue" as const }
  }
}

function EntryHeader({ entry }: { entry: ChatEntry }) {
  const label = roleLabel(entry)
  const title = entry.toolName || entry.subagentId || ""
  const hasDetail = Boolean(entry.detail)
  const marker = hasDetail ? (entry.expanded ? "▼" : "▶") : " "

  return (
    <Box>
      <Text color={label.color} bold>[{label.text}]</Text>
      {hasDetail && <Text dimColor> {marker}</Text>}
      {title && <Text color={label.color}> {title}</Text>}
      {entry.verification && (
        <Text color={entry.verification.result === "pass" ? "green" : entry.verification.result === "fail" ? "red" : "yellow"}>
          {" "}{entry.verification.result === "pass" ? "✓" : entry.verification.result === "fail" ? "✗" : "○"}
          {" "}{entry.verification.type}
        </Text>
      )}
    </Box>
  )
}

function EntryBody({ entry }: { entry: ChatEntry }) {
  if (!entry.text && !entry.detail && !entry.verification) return null

  const text = entry.expanded && entry.detail ? entry.detail : entry.text
  const muted = entry.role === "reasoning" || entry.role === "system" || entry.role === "progress"

  if (entry.role === "assistant") {
    return (
      <Box paddingLeft={2} flexDirection="column">
        <MarkdownText text={text} />
      </Box>
    )
  }

  if (entry.role === "verification" && entry.verification) {
    const resultColor = entry.verification.result === "pass" ? "green" : entry.verification.result === "fail" ? "red" : "yellow"
    return (
      <Box paddingLeft={2} flexDirection="column">
        <Text color={resultColor}>
          {entry.verification.type}: {entry.verification.result}
        </Text>
        <Text dimColor>{entry.verification.evidence}</Text>
      </Box>
    )
  }

  if (entry.role === "tool_use" || entry.role === "tool_result") {
    return (
      <Box paddingLeft={2} flexDirection="column">
        <Text color={entry.role === "tool_result" ? "gray" : "yellow"}>{text || " "}</Text>
      </Box>
    )
  }

  return (
    <Box paddingLeft={2} flexDirection="column">
      <Text dimColor={muted} color={entry.role === "error" ? "red" : undefined}>{text || " "}</Text>
    </Box>
  )
}

export function ChatEntryView({ entry }: { entry: ChatEntry }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <EntryHeader entry={entry} />
      <EntryBody entry={entry} />
    </Box>
  )
}

export function ChatHistory({ entries }: { entries: ChatEntry[] }) {
  return (
    <Box flexDirection="column">
      {entries.map((entry, index) => (
        <ChatEntryView key={entry.id || `${entry.role}-${index}`} entry={entry} />
      ))}
    </Box>
  )
}
