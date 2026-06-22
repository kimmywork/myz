import React from "react"
import { Box, Text } from "ink"

export interface StatusBarProps {
  workspace: string
  model: string
  tokenUsed: number
  tokenTotal: number
  agent: string
  version: string
}

export function StatusBar({
  workspace,
  model,
  tokenUsed,
  tokenTotal,
  agent,
  version,
}: StatusBarProps) {
  const pct = tokenTotal > 0 ? Math.round((tokenUsed / tokenTotal) * 100) : 0
  const tokenBar = `${tokenUsed}/${tokenTotal} (${pct}%)`

  // Shorten workspace path
  const shortWorkspace = workspace.length > 30
    ? "..." + workspace.slice(-27)
    : workspace

  return (
    <Box
      justifyContent="space-between"
      borderStyle="single"
      borderTop={true}
      paddingLeft={1}
      paddingRight={1}
    >
      <Text dimColor>{shortWorkspace}</Text>
      <Text>{model}</Text>
      <Text dimColor>{tokenBar}</Text>
      <Text color="cyan">{agent}</Text>
      <Text dimColor>{version}</Text>
    </Box>
  )
}
