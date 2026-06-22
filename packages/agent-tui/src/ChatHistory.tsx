import React, { useState } from "react"
import { Box, Text, useInput } from "ink"
import { MarkdownText } from "./MarkdownText"

export interface ChatEntry {
  role: "user" | "assistant" | "error" | "progress" | "system" | "tool_use" | "reasoning" | "subagent"
  text: string
  detail?: string        // expandable detail content
  toolName?: string      // for tool_use entries
  subagentId?: string    // for subagent entries
  expanded?: boolean     // default collapsed
}

function RoleBadge({ role }: { role: ChatEntry["role"] }) {
  switch (role) {
    case "user": return <Text color="cyan" bold>[YOU]</Text>
    case "assistant": return <Text color="green" bold>[AI]</Text>
    case "error": return <Text color="red" bold>[ERR]</Text>
    case "tool_use": return <Text color="yellow" dimColor>[TOOL]</Text>
    case "reasoning": return <Text color="gray" dimColor>[THINK]</Text>
    case "subagent": return <Text color="magenta" dimColor>[SUB]</Text>
    case "progress": return <Text color="gray" dimColor>[...]</Text>
    case "system": return <Text color="gray" dimColor>[SYS]</Text>
  }
}

function CollapsibleEntry({ entry }: { entry: ChatEntry }) {
  const [expanded, setExpanded] = useState(entry.expanded ?? false)

  useInput((input, key) => {
    // Toggle expand on Enter when this entry is focused (simplified: global toggle)
  })

  if (!entry.detail) {
    // No expandable content — render normally
    return <RenderedEntry entry={entry} />
  }

  return (
    <Box flexDirection="column">
      <Box>
        <RoleBadge role={entry.role} />
        <Text color="gray" dimColor> {expanded ? "▼" : "▶"}</Text>
        <Text> {expanded ? "" : entry.text}</Text>
      </Box>
      {expanded && (
        <Box paddingLeft={2}>
          <RenderedContent role={entry.role} text={entry.detail} />
        </Box>
      )}
    </Box>
  )
}

function RenderedContent({ role, text }: { role: ChatEntry["role"]; text: string }) {
  if (role === "assistant") {
    return <MarkdownText text={text} />
  }
  return <Text>{text}</Text>
}

function RenderedEntry({ entry }: { entry: ChatEntry }) {
  return (
    <Box flexDirection="column">
      <Box>
        <RoleBadge role={entry.role} />
        {entry.toolName && <Text color="yellow" dimColor> {entry.toolName}</Text>}
        {entry.subagentId && <Text color="magenta" dimColor> {entry.subagentId}</Text>}
      </Box>
      <Box paddingLeft={1}>
        <RenderedContent role={entry.role} text={entry.text} />
      </Box>
    </Box>
  )
}

export function ChatHistory({ entries }: { entries: ChatEntry[] }) {
  return (
    <>
      {entries.map((entry, i) => (
        <CollapsibleEntry key={i} entry={entry} />
      ))}
    </>
  )
}
