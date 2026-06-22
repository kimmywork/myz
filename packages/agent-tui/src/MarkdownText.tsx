import React from "react"
import { Text } from "ink"

// Simple Markdown → Ink Text renderer
// Supports: **bold**, `code`, ```code block```, # headings, - lists, > quotes
export function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n")
  const elements: React.ReactNode[] = []

  let inCodeBlock = false
  let codeLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <Text key={`code-${i}`} color="gray">
            {codeLines.join("\n")}
          </Text>
        )
        codeLines = []
        inCodeBlock = false
      } else {
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }

    // Heading
    if (line.startsWith("# ")) {
      elements.push(<Text key={i} bold color="white">{line.slice(2)}</Text>)
      continue
    }
    if (line.startsWith("## ")) {
      elements.push(<Text key={i} bold>{line.slice(3)}</Text>)
      continue
    }
    if (line.startsWith("### ")) {
      elements.push(<Text key={i} bold dimColor>{line.slice(4)}</Text>)
      continue
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <Text key={i} color="gray" italic>  {renderInline(line.slice(2))}</Text>
      )
      continue
    }

    // List item
    if (line.match(/^[-*]\s/)) {
      elements.push(
        <Text key={i}>  {renderInline(line.slice(2))}</Text>
      )
      continue
    }

    // Numbered list
    if (line.match(/^\d+\.\s/)) {
      const match = line.match(/^(\d+\.\s)(.*)/)
      if (match) {
        elements.push(
          <Text key={i}>  {renderInline(match[2])}</Text>
        )
      }
      continue
    }

    // Empty line
    if (!line.trim()) {
      elements.push(<Text key={i}> </Text>)
      continue
    }

    // Normal text with inline formatting
    elements.push(<Text key={i}>{renderInline(line)}</Text>)
  }

  // Flush remaining code block
  if (inCodeBlock && codeLines.length) {
    elements.push(
      <Text key="code-end" color="gray">{codeLines.join("\n")}</Text>
    )
  }

  return <>{elements}</>
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // Match: **bold**, `code`, ***bold italic***
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|`([^`]+)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    if (match[2]) {
      // ***bold italic***
      parts.push(<Text key={match.index} bold italic>{match[2]}</Text>)
    } else if (match[3]) {
      // **bold**
      parts.push(<Text key={match.index} bold>{match[3]}</Text>)
    } else if (match[4]) {
      // `code`
      parts.push(<Text key={match.index} color="cyan" backgroundColor="gray">{match[4]}</Text>)
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length ? parts : [text]
}
