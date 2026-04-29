import type { RuntimeMonitorSnapshot } from "../runtimeMonitor"
import { THEME } from "./shared"

type Phase = RuntimeMonitorSnapshot["phase"]
type ChatEntry = RuntimeMonitorSnapshot["chatTail"][number]

function isFullWidthCodePoint(codePoint: number) {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2329 && codePoint <= 0x232a) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff01 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  )
}

function charDisplayWidth(char: string) {
  const codePoint = char.codePointAt(0) || 0
  if (codePoint === 0) return 0
  if (codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0
  return isFullWidthCodePoint(codePoint) ? 2 : 1
}

function textDisplayWidth(value: string) {
  let width = 0
  for (const char of value) {
    width += charDisplayWidth(char)
  }
  return width
}

function chunkTextByWidth(value: string, width: number) {
  const safeWidth = Math.max(1, width)
  const chunks: string[] = []
  let current = ""
  let currentWidth = 0

  for (const char of value) {
    const nextWidth = charDisplayWidth(char)
    if (current && currentWidth + nextWidth > safeWidth) {
      chunks.push(current)
      current = char
      currentWidth = nextWidth
      continue
    }
    current += char
    currentWidth += nextWidth
  }

  if (current) {
    chunks.push(current)
  }

  return chunks.length ? chunks : [""]
}

export function wrapText(value: string, width: number) {
  const safeWidth = Math.max(16, width)
  const lines: string[] = []

  value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .forEach((rawLine) => {
      const line = rawLine.replace(/\t/g, "  ")
      if (!line.trim()) {
        lines.push("")
        return
      }

      const tokens = line.split(/(\s+)/).filter(Boolean)
      let current = ""
      let currentWidth = 0

      tokens.forEach((token) => {
        if (/^\s+$/.test(token)) {
          if (!current) return
          current += token
          currentWidth += textDisplayWidth(token)
          return
        }

        const tokenWidth = textDisplayWidth(token)
        if (tokenWidth > safeWidth) {
          if (current.trimEnd()) {
            lines.push(current.trimEnd())
          }
          current = ""
          currentWidth = 0
          const chunks = chunkTextByWidth(token, safeWidth)
          chunks.forEach((chunk, index) => {
            const chunkWidth = textDisplayWidth(chunk)
            if (chunkWidth >= safeWidth || index < chunks.length - 1) {
              lines.push(chunk)
              return
            }
            current = chunk
            currentWidth = chunkWidth
          })
          return
        }

        if (current && currentWidth + tokenWidth > safeWidth) {
          lines.push(current.trimEnd())
          current = token
          currentWidth = tokenWidth
          return
        }

        current += token
        currentWidth += tokenWidth
      })

      if (current || !tokens.length) {
        lines.push(current.trimEnd())
      }
    })

  if (!lines.length) {
    return [""]
  }

  return lines
}

export function formatTimestamp(value: string) {
  const normalized = value.trim()
  if (!normalized) return "--:--:--"
  return normalized.slice(11, 19) || normalized
}

export function buildMeter(value: number, max: number, width = 16) {
  const safeMax = Math.max(1, max)
  const clamped = Math.max(0, Math.min(value, safeMax))
  const filled = Math.round((clamped / safeMax) * width)
  return "#".repeat(filled) + "-".repeat(Math.max(0, width - filled))
}

export function escapeContent(value: string) {
  return value.replace(/\{/g, "\\{").replace(/\}/g, "\\}")
}

export function badge(text: string, fg: string, bg: string) {
  return `{${fg}-fg}{${bg}-bg} ${escapeContent(text)} {/${bg}-bg}{/${fg}-fg}`
}

export function phaseBadgeTone(phase: Phase) {
  switch (phase) {
    case "idle":
      return "green"
    case "llm":
      return "yellow"
    case "tool":
      return "cyan"
    case "send":
      return "blue"
    case "error":
      return "red"
  }
}

export function toneForPhase(phase: Phase) {
  switch (phase) {
    case "idle":
      return THEME.success
    case "llm":
      return THEME.accentAlt
    case "tool":
      return THEME.accent
    case "send":
      return THEME.info
    case "error":
      return THEME.error
  }
}

function roleTone(role: ChatEntry["role"]) {
  switch (role) {
    case "user":
      return { label: "YOU", fg: "black", bg: "cyan", accent: "cyan" }
    case "assistant":
      return { label: "BOT", fg: "black", bg: "green", accent: "green" }
    case "progress":
      return { label: "PROGRESS", fg: "black", bg: "yellow", accent: "yellow" }
    case "error":
      return { label: "ERROR", fg: "black", bg: "red", accent: "red" }
    case "scheduler":
      return { label: "SCHED", fg: "black", bg: "blue", accent: "blue" }
    case "system":
      return { label: "SYSTEM", fg: "black", bg: "gray", accent: "gray" }
  }
}

export function renderChatEntry(options: { entry: ChatEntry; chatWidth: number }) {
  const tone = roleTone(options.entry.role)
  const wrappedLines = wrapText(options.entry.text, Math.max(20, options.chatWidth - 6))
  return {
    content: [
      `${badge(tone.label, tone.fg, tone.bg)}  {gray-fg}${escapeContent(formatTimestamp(options.entry.at))}{/gray-fg}  {bold}${escapeContent(options.entry.conversationId)}{/bold}`,
      `{${tone.accent}-fg}${"-".repeat(Math.max(8, Math.min(18, tone.label.length + 6)))}{/${tone.accent}-fg}`,
      ...wrappedLines.map((line) => escapeContent(line)),
    ].join("\n"),
  }
}

export function colorizePhase(phase: Phase) {
  switch (phase) {
    case "idle":
      return "{green-fg}idle{/green-fg}"
    case "llm":
      return "{yellow-fg}llm{/yellow-fg}"
    case "tool":
      return "{cyan-fg}tool{/cyan-fg}"
    case "send":
      return "{magenta-fg}send{/magenta-fg}"
    case "error":
      return "{red-fg}error{/red-fg}"
  }
}

export function formatDurationMs(durationMs: number) {
  if (durationMs <= 0) return "0.00s"
  return `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 1 : 2)}s`
}

export function formatTokensPerSecond(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "n/a"
  return value >= 100 ? `${value.toFixed(0)}/s` : `${value.toFixed(1)}/s`
}

export const CHAT_ENTRY_SEPARATOR = "{gray-fg}------------{/gray-fg}"
