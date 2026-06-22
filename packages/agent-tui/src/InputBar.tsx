import React, { useState } from "react"
import { Box, Text, useInput, useWindowSize, useCursor } from "ink"
import stringWidth from "string-width"

export function InputBar({
  onSubmit,
  placeholder = "Type your message or /help",
}: {
  onSubmit: (text: string) => void
  placeholder?: string
}) {
  const [value, setValue] = useState("")
  const [cursorOffset, setCursorOffset] = useState(0)
  const { columns } = useWindowSize()
  const { setCursorPosition } = useCursor()

  const prompt = "> "
  const promptWidth = stringWidth(prompt)
  const availableWidth = columns - promptWidth

  // Compute cursor position accounting for wide chars + line wrapping
  const textBeforeCursor = value.slice(0, cursorOffset)
  const cursorX = stringWidth(prompt + textBeforeCursor)

  let cursorRow = 0
  let cursorCol = cursorX
  if (availableWidth > 0) {
    cursorRow = Math.floor(cursorX / availableWidth)
    cursorCol = cursorX % availableWidth
  }

  setCursorPosition({ x: cursorCol, y: cursorRow })

  useInput((input, key) => {
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
    if (key.upArrow || key.downArrow) return
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

  const beforeCursor = value.slice(0, cursorOffset)
  const atCursor = value[cursorOffset] || ""
  const afterCursor = value.slice(cursorOffset + 1)

  return (
    <Box>
      <Text color="cyan" bold>{prompt}</Text>
      <Text wrap="wrap">{beforeCursor}</Text>
      <Text inverse wrap="wrap">{atCursor || " "}</Text>
      <Text wrap="wrap">{afterCursor}</Text>
    </Box>
  )
}
