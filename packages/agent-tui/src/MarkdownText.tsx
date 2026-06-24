import React from "react"
import { Box, Text } from "ink"

interface InlineToken {
  kind: "text" | "bold" | "code" | "boldItalic"
  text: string
}

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|`([^`]+)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: "text", text: text.slice(lastIndex, match.index) })
    }

    if (match[2]) tokens.push({ kind: "boldItalic", text: match[2] })
    else if (match[3]) tokens.push({ kind: "bold", text: match[3] })
    else if (match[4]) tokens.push({ kind: "code", text: match[4] })

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    tokens.push({ kind: "text", text: text.slice(lastIndex) })
  }

  return tokens.length ? tokens : [{ kind: "text", text }]
}

function InlineText({ text }: { text: string }) {
  return (
    <Text wrap="wrap">
      {tokenizeInline(text).map((token, index) => {
        if (token.kind === "boldItalic") return <Text key={index} bold italic>{token.text}</Text>
        if (token.kind === "bold") return <Text key={index} bold>{token.text}</Text>
        if (token.kind === "code") return <Text key={index} color="cyan">`{token.text}`</Text>
        return token.text
      })}
    </Text>
  )
}

function MarkdownLine({ line }: { line: string }) {
  if (!line.trim()) return <Text> </Text>

  if (line.startsWith("### ")) {
    return <Text bold dimColor>{line.slice(4)}</Text>
  }

  if (line.startsWith("## ")) {
    return <Text bold>{line.slice(3)}</Text>
  }

  if (line.startsWith("# ")) {
    return <Text bold color="white">{line.slice(2)}</Text>
  }

  if (line.startsWith("> ")) {
    return <Text color="gray">│ {line.slice(2)}</Text>
  }

  const unordered = line.match(/^\s*[-*]\s+(.*)$/)
  if (unordered) {
    return <Text><Text color="gray">• </Text><InlineText text={unordered[1]} /></Text>
  }

  const ordered = line.match(/^\s*(\d+)\.\s+(.*)$/)
  if (ordered) {
    return <Text><Text color="gray">{ordered[1]}. </Text><InlineText text={ordered[2]} /></Text>
  }

  return <InlineText text={line} />
}

export function MarkdownText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/)
  const nodes: React.ReactNode[] = []
  let codeLines: string[] = []
  let inCodeBlock = false

  const flushCodeBlock = (key: string) => {
    nodes.push(
      <Box key={key} flexDirection="column" borderStyle="round" borderColor="gray" paddingLeft={1} paddingRight={1}>
        {(codeLines.length ? codeLines : [""]).map((line, index) => (
          <Text key={index} color="gray">{line || " "}</Text>
        ))}
      </Box>,
    )
    codeLines = []
  }

  lines.forEach((line, index) => {
    if (line.trimStart().startsWith("```")) {
      if (inCodeBlock) {
        flushCodeBlock(`code-${index}`)
        inCodeBlock = false
      } else {
        inCodeBlock = true
        codeLines = []
      }
      return
    }

    if (inCodeBlock) {
      codeLines.push(line)
      return
    }

    nodes.push(<MarkdownLine key={index} line={line} />)
  })

  if (inCodeBlock) flushCodeBlock("code-end")

  return <Box flexDirection="column">{nodes}</Box>
}
