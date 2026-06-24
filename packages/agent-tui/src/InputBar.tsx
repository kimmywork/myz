import React, { useState, useRef } from "react"
import { Box, Text, useBoxMetrics, useCursor, useInput, useWindowSize, type DOMElement } from "ink"
import stringWidth from "string-width"
import { isMouseInput } from "./terminalInput"

interface WrappedLine {
  text: string
  start: number
  end: number
  width: number
}

function getAbsolutePosition(element: DOMElement | null) {
  let x = 0
  let y = 0
  let node: DOMElement | undefined = element ?? undefined

  while (node) {
    x += node.yogaNode?.getComputedLeft() ?? 0
    y += node.yogaNode?.getComputedTop() ?? 0
    node = node.parentNode
  }

  return { x, y }
}

export function __wrapInputForTest(value: string, width: number): WrappedLine[] {
  if (value.length === 0) return [{ text: "", start: 0, end: 0, width: 0 }]

  const lines: WrappedLine[] = []
  let lineText = ""
  let lineStart = 0
  let lineWidth = 0
  let index = 0

  const pushLine = (end: number) => {
    lines.push({ text: lineText, start: lineStart, end, width: lineWidth })
    lineText = ""
    lineStart = end
    lineWidth = 0
  }

  while (index < value.length) {
    const char = value[index]

    if (char === "\r" || char === "\n") {
      const newlineLength = char === "\r" && value[index + 1] === "\n" ? 2 : 1
      pushLine(index)
      index += newlineLength
      lineStart = index
      continue
    }

    const codePoint = value.codePointAt(index)
    const inputChar = codePoint === undefined ? char : String.fromCodePoint(codePoint)
    const charWidth = Math.max(1, stringWidth(inputChar))

    if (lineWidth > 0 && lineWidth + charWidth > width) {
      pushLine(index)
    }

    lineText += inputChar
    lineWidth += charWidth
    index += inputChar.length
  }

  lines.push({ text: lineText, start: lineStart, end: index, width: lineWidth })

  if (lineWidth >= width) {
    lines.push({ text: "", start: index, end: index, width: 0 })
  }

  return lines
}

export function __getCursorPositionForTest(lines: WrappedLine[], cursorOffset: number) {
  for (let row = 0; row < lines.length; row++) {
    const line = lines[row]
    const nextLine = lines[row + 1]
    const isLastLine = row === lines.length - 1
    const isInsideLine = cursorOffset >= line.start && (cursorOffset < line.end || isLastLine)
    const isOnHardBreak = nextLine && cursorOffset >= line.end && cursorOffset < nextLine.start

    if (isInsideLine || isOnHardBreak) {
      return {
        row,
        col: stringWidth(line.text.slice(0, Math.max(0, cursorOffset - line.start))),
      }
    }
  }

  const lastLine = lines[lines.length - 1]
  return { row: lines.length - 1, col: lastLine.width }
}

export function __getOffsetForColumnForTest(line: WrappedLine, targetCol: number) {
  if (!line.text) return line.start

  let width = 0
  let offset = line.start
  for (const char of line.text) {
    const charWidth = Math.max(1, stringWidth(char))
    if (width + charWidth > targetCol) break
    width += charWidth
    offset += char.length
  }

  return Math.min(offset, line.end)
}

export function InputBar({
  onSubmit,
  placeholder = "Type your message or /help",
  maxRows = 4,
}: {
  onSubmit: (text: string) => void
  placeholder?: string
  maxRows?: number
}) {
  const [value, setValue] = useState("")
  const [cursorOffset, setCursorOffset] = useState(0)
  const inputRef = useRef<DOMElement | null>(null)
  const inputMetrics = useBoxMetrics(inputRef)
  const { columns } = useWindowSize()
  const { setCursorPosition } = useCursor()

  const prompt = "> "
  const promptWidth = stringWidth(prompt)
  const inputPosition = getAbsolutePosition(inputRef.current)
  const textWidth = Math.max(1, columns - promptWidth)
  const wrappedLines = __wrapInputForTest(value, textWidth)
  const cursorPosition = __getCursorPositionForTest(wrappedLines, cursorOffset)
  const viewportStart = Math.max(0, cursorPosition.row - maxRows + 1)
  const visibleLines = wrappedLines.slice(viewportStart, viewportStart + maxRows)
  const cursorVisibleRow = cursorPosition.row - viewportStart

  // `useCursor` coordinates are relative to the whole Ink frame, not this
  // component. Use the same manual wrapping model for rendering and cursor
  // placement, so the terminal cursor / IME buffer can't drift from InputBar.
  setCursorPosition(inputMetrics.hasMeasured
    ? {
      x: inputPosition.x + promptWidth + cursorPosition.col,
      y: inputPosition.y + cursorVisibleRow,
    }
    : undefined)

  useInput((input, key) => {
    if (isMouseInput(input)) return

    if (key.return) {
      if (value.trim()) {
        onSubmit(value.trim())
        setValue("")
        setCursorOffset(0)
      }
      return
    }
    if (key.leftArrow) { setCursorOffset((p) => Math.max(0, p - 1)); return }
    if (key.rightArrow) { setCursorOffset((p) => Math.min(value.length, p + 1)); return }
    if (key.upArrow || key.downArrow) {
      const direction = key.upArrow ? -1 : 1
      const nextRow = cursorPosition.row + direction
      const nextLine = wrappedLines[nextRow]
      if (nextLine) {
        setCursorOffset(__getOffsetForColumnForTest(nextLine, cursorPosition.col))
      }
      return
    }
    if (key.backspace || key.delete) {
      if (cursorOffset > 0) {
        setValue((prev) => prev.slice(0, cursorOffset - 1) + prev.slice(cursorOffset))
        setCursorOffset((p) => p - 1)
      }
      return
    }
    if (key.ctrl && input === "c") { process.exit(0); return }
    if (input && !key.ctrl && !key.meta) {
      setValue((prev) => prev.slice(0, cursorOffset) + input + prev.slice(cursorOffset))
      setCursorOffset((p) => p + input.length)
    }
  })

  return (
    <Box ref={inputRef} width={columns} flexDirection="column" flexShrink={0}>
      {visibleLines.map((line, index) => {
        const isFirstVisibleLine = viewportStart + index === 0
        const cursorOnLine = cursorVisibleRow === index
        const showPlaceholder = value.length === 0 && cursorOnLine

        return (
          <Box key={`${line.start}-${index}`} width={columns}>
            {isFirstVisibleLine ? <Text color="cyan" bold>{prompt}</Text> : <Text>{" ".repeat(promptWidth)}</Text>}
            <Text>{showPlaceholder ? <Text dimColor>{placeholder}</Text> : (line.text || " ")}</Text>
          </Box>
        )
      })}
    </Box>
  )
}
