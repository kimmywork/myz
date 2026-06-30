import { Box, Text, useWindowSize } from "ink"
import React from "react"
import stringWidth from "string-width"

export interface StatusBarProps {
  workspace: string
  model: string
  tokenUsed: number
  tokenTotal: number
  agent: string
  version: string
  todoProgress?: string  // 格式: "3/5" 或 "3/5 | Task: xxx"
  permissionMode?: string  // 权限模式
}

function fitStart(value: string, maxWidth: number) {
  if (maxWidth <= 0) return ""
  if (stringWidth(value) <= maxWidth) return value
  if (maxWidth <= 1) return "…"

  let result = ""
  for (const char of [...value].reverse()) {
    if (stringWidth(`…${char}${result}`) > maxWidth) break
    result = `${char}${result}`
  }
  return `…${result}`
}

function fitEnd(value: string, maxWidth: number) {
  if (maxWidth <= 0) return ""
  if (stringWidth(value) <= maxWidth) return value
  if (maxWidth <= 1) return "…"

  let result = ""
  for (const char of value) {
    if (stringWidth(`${result}${char}…`) > maxWidth) break
    result += char
  }
  return `${result}…`
}

export function __formatStatusLineForTest(props: StatusBarProps, columns: number) {
  const pct = props.tokenTotal > 0 ? Math.round((props.tokenUsed / props.tokenTotal) * 100) : 0
  const tokenBar = `${props.tokenUsed}/${props.tokenTotal} (${pct}%)`
  const todoStr = props.todoProgress ? `  ${props.todoProgress}` : ""
  const permStr = props.permissionMode ? `  [${props.permissionMode}]` : ""
  const right = `${fitStart(props.model, Math.max(8, Math.floor(columns * 0.28)))}  ${tokenBar}  ${props.agent}  ${props.version}${todoStr}${permStr}`
  const available = Math.max(0, columns - 4)

  if (stringWidth(right) >= available) {
    return fitEnd(right, available)
  }

  const workspaceWidth = Math.max(0, available - stringWidth(right) - 2)
  const left = fitStart(props.workspace, workspaceWidth)
  return `${left}${left ? "  " : ""}${right}`
}

export function StatusBar(props: StatusBarProps) {
  const { columns } = useWindowSize()
  const statusLine = __formatStatusLineForTest(props, columns)

  return (
    <Box
      width="100%"
      height={3}
      borderStyle="single"
      paddingLeft={1}
      paddingRight={1}
      overflow="hidden"
    >
      <Text wrap="truncate-end">{statusLine}</Text>
    </Box>
  )
}
