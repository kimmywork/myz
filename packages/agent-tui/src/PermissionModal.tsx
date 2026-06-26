import React, { useState } from "react"
import { Box, Text, useInput } from "ink"

export interface PermissionModalProps {
  tool: string
  args: Record<string, unknown>
  riskLevel: "low" | "medium" | "high"
  defaultPattern: string
  onChoice: (choice: "y" | "n" | "session" | "workspace", pattern?: string) => void
}

export function PermissionModal({
  tool,
  args,
  riskLevel,
  defaultPattern,
  onChoice,
}: PermissionModalProps) {
  const [choice, setChoice] = useState<"y" | "n" | "session" | "workspace" | null>(null)
  const [pattern, setPattern] = useState(defaultPattern)
  const [patternError, setPatternError] = useState<string | null>(null)

  const riskColor = riskLevel === "high" ? "red" : riskLevel === "medium" ? "yellow" : "green"
  const argsStr = JSON.stringify(args, null, 2)

  useInput((input, key) => {
    if (choice === null) {
      // 选择阶段
      if (input === "y" || input === "Y") {
        onChoice("y")
      } else if (input === "n" || input === "N") {
        onChoice("n")
      } else if (input === "s" || input === "S") {
        setChoice("session")
      } else if (input === "w" || input === "W") {
        setChoice("workspace")
      }
    } else if (choice === "session" || choice === "workspace") {
      // 输入 pattern 阶段
      if (key.return) {
        // 验证 pattern 是否匹配原命令/路径
        if (validatePattern(pattern, tool, args)) {
          onChoice(choice, pattern)
        } else {
          setPatternError("Pattern does not match the original command/path")
        }
      } else if (key.escape) {
        setChoice(null)
        setPattern(defaultPattern)
        setPatternError(null)
      } else if (key.backspace) {
        setPattern((prev) => prev.slice(0, -1))
        setPatternError(null)
      } else if (input && !key.ctrl && !key.meta) {
        setPattern((prev) => prev + input)
        setPatternError(null)
      }
    }
  })

  if (choice === "session" || choice === "workspace") {
    return (
      <Box flexDirection="column" borderStyle="double" paddingLeft={1} paddingRight={1} marginBottom={1}>
        <Text bold>Permission Rule Pattern</Text>
        <Text dimColor>
          {choice === "session" ? "Session" : "Workspace"} level rule
        </Text>
        <Box marginTop={1}>
          <Text>Pattern: </Text>
          <Text color="cyan">{pattern}</Text>
          <Text dimColor>_</Text>
        </Box>
        {patternError && (
          <Text color="red">Error: {patternError}</Text>
        )}
        <Box marginTop={1}>
          <Text dimColor>Enter to confirm | Escape to cancel</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" borderStyle="double" paddingLeft={1} paddingRight={1} marginBottom={1}>
      <Box>
        <Text bold>Permission Request: </Text>
        <Text color={riskColor} bold>[{riskLevel.toUpperCase()}]</Text>
      </Box>
      <Box marginTop={1}>
        <Text bold>Tool: </Text>
        <Text color="cyan">{tool}</Text>
      </Box>
      <Box>
        <Text bold>Args: </Text>
        <Text dimColor>{argsStr}</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Allow this operation?</Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          <Text color="green" bold>[Y]</Text>
          <Text> Yes | </Text>
          <Text color="red" bold>[N]</Text>
          <Text> No | </Text>
          <Text color="yellow" bold>[S]</Text>
          <Text> Allow for session | </Text>
          <Text color="magenta" bold>[W]</Text>
          <Text> Allow for workspace</Text>
        </Text>
      </Box>
    </Box>
  )
}

function validatePattern(pattern: string, tool: string, args: Record<string, unknown>): boolean {
  // 简单验证：pattern 是否包含 tool 名
  if (!pattern.includes(tool)) return false

  // 检查 pattern 是否匹配原命令/路径
  const command = String(args.command || "")
  const path = String(args.path || "")
  const target = command || path

  if (!target) return true

  // 简单的 glob 匹配验证
  const regex = patternToRegex(pattern)
  return regex.test(target)
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::::DOUBLE_STAR::::")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/::::DOUBLE_STAR::::/g, ".*")
  return new RegExp(`^${escaped}$`)
}
