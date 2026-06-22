import React from "react"
import { Box, Static, useApp, useInput } from "ink"
import { ChatHistory, type ChatEntry } from "./ChatHistory"
import { InputBar } from "./InputBar"
import { StatusBar, type StatusBarProps } from "./StatusBar"

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

  useInput((input, key) => {
    if (key.ctrl && input === "c") exit()
  })

  const staticEntries = entries.slice(0, -1)
  const streamingEntry = entries.length > 0 ? entries[entries.length - 1] : null

  return (
    <Box flexDirection="column">
      {/* Static content — chat history + status bar, rendered once */}
      <Static items={staticEntries}>
        {(entry: ChatEntry) => (
          <ChatHistory key={`${entry.role}-${entry.text.slice(0, 20)}`} entries={[entry]} />
        )}
      </Static>
      {streamingEntry && streamingEntry.text && (
        <ChatHistory entries={[streamingEntry]} />
      )}
      <StatusBar
        workspace={workspace}
        model={model}
        tokenUsed={tokenUsed}
        tokenTotal={tokenTotal}
        agent={agentId}
        version={version}
      />
      {/* Input — ABSOLUTE LAST element, cursor lands here */}
      <InputBar onSubmit={onMessage} />
    </Box>
  )
}
