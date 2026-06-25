import React from "react"
import { Box, Static, useApp, useInput } from "ink"
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

export function __splitEntriesForTest(entries: ChatEntry[]) {
  return {
    completeEntries: entries.filter((entry) => entry.status !== "pending"),
    pendingEntries: entries.filter((entry) => entry.status === "pending"),
  }
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
  const { completeEntries, pendingEntries } = __splitEntriesForTest(entries)

  useInput((input, key) => {
    if (key.ctrl && input === "c") exit()
  })

  return (
    <Box flexDirection="column" width="100%">
      <Static items={completeEntries}>
        {(entry: ChatEntry, index) => (
          <ChatHistory key={entry.id || `${entry.role}-${index}`} entries={[entry]} />
        )}
      </Static>

      {pendingEntries.length > 0 && (
        <Box flexDirection="column">
          <ChatHistory entries={pendingEntries} />
        </Box>
      )}

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
