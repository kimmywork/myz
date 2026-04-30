import {
  DEFAULT_HIGHLIGHT_STYLE,
  HIGHLIGHT_STYLES,
  type HIGHLIGHT_STYLES as HighlightStyle,
} from "@myz/shared"

const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/

export function normalizeHighlightStyle(style: unknown): HighlightStyle {
  return Object.values(HIGHLIGHT_STYLES).includes(style as HighlightStyle)
    ? (style as HighlightStyle)
    : DEFAULT_HIGHLIGHT_STYLE
}

export function normalizeColor(
  value: string | undefined,
  fallback: string,
): string {
  const trimmed = (value || "").trim()
  return COLOR_PATTERN.test(trimmed) ? trimmed.toLowerCase() : fallback
}

export function normalizePalette(
  defaults: readonly string[],
  incoming: readonly string[] | undefined,
): string[] {
  const base =
    Array.isArray(incoming) && incoming.length ? [...incoming] : [...defaults]
  const filled: string[] = []
  for (let index = 0; index < 5; index += 1) {
    const fallback = defaults[index] ?? defaults[0] ?? "#fde68a"
    const candidate = base[index] ?? fallback
    filled.push(normalizeColor(candidate, fallback))
  }
  return filled
}
