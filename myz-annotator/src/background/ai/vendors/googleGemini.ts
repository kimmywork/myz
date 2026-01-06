export function splitGeminiThoughtTaggedContent(content: string): {
  text: string
  thought: string
} {
  if (!content) {
    return { text: "", thought: "" }
  }

  const thoughtParts: string[] = []
  const text = content.replace(
    /<thought>([\s\S]*?)<\/thought>/g,
    (_, thought: string) => {
      const trimmed = typeof thought === "string" ? thought.trim() : ""
      if (trimmed) {
        thoughtParts.push(trimmed)
      }
      return ""
    },
  )

  return {
    text: text.trim(),
    thought: thoughtParts.join("\n\n").trim(),
  }
}

export function extractGeminiThoughtSegments(buffer: string): {
  buffer: string
  thought: string
} {
  if (!buffer) {
    return { buffer: "", thought: "" }
  }

  const parts: string[] = []
  const openTag = "<thought>"
  const closeTag = "</thought>"
  let working = buffer

  while (true) {
    const start = working.indexOf(openTag)
    if (start === -1) break
    const end = working.indexOf(closeTag, start + openTag.length)
    if (end === -1) break
    const inner = working.slice(start + openTag.length, end).trim()
    if (inner) {
      parts.push(inner)
    }
    working = working.slice(0, start) + working.slice(end + closeTag.length)
  }

  return { buffer: working, thought: parts.join("\n\n").trim() }
}

