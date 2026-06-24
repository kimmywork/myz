import React from "react"
import { Box, useApp, useInput, useWindowSize } from "ink"
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

  return (
    <Box flexDirection="column" width="100%" height={frameHeight}>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <ChatHistory entries={entries} />
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
