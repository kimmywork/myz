import React from "react"
import { Box, Static, useApp, useInput, useWindowSize } from "ink"
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
  const { rows } = useWindowSize()
  const frameHeight = Math.max(1, rows - 1)

  useInput((input, key) => {
    if (key.ctrl && input === "c") exit()
  })

  const staticEntries = entries.slice(0, -1)
  const streamingEntry = entries.length > 0 ? entries[entries.length - 1] : null

  return (
    <Box flexDirection="column" width="100%" height={frameHeight}>
      {/* Static content — completed chat history, rendered above the live frame. */}
      <Static items={staticEntries}>
        {(entry: ChatEntry) => (
          <ChatHistory key={`${entry.role}-${entry.text.slice(0, 20)}`} entries={[entry]} />
        )}
      </Static>

      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {streamingEntry && streamingEntry.text && (
          <ChatHistory entries={[streamingEntry]} />
        )}
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
