import { HighlightStyleSchema, SanitizedColorSchema } from "./schemas"
import {
  type MyZRecord,
  HIGHLIGHT_STYLES,
  RECORD_KINDS,
  getRecordKind,
  normalizeRecord as normalizeBaseRecord,
} from "./types.ts"

// Default single color and palette tuned for better visibility on dark
// backgrounds. These are slightly more saturated / deeper than the old
// pastel values so highlights remain readable when the page uses a dark
// color scheme.

export function normalizeHighlightStyle(style: unknown): HIGHLIGHT_STYLES {
  return HighlightStyleSchema.parse(style)
}

export function describeHighlightStyle(style: HIGHLIGHT_STYLES): string {
  const normalized = normalizeHighlightStyle(style)
  if (normalized === HIGHLIGHT_STYLES.UNDERLINE) {
    return "下划线"
  }
  if (normalized === HIGHLIGHT_STYLES.WAVY) {
    return "波浪线"
  }
  return "高亮"
}

export function normalizeRecord(
  record: MyZRecord | null | undefined,
): MyZRecord | null {
  if (!record) {
    return null
  }
  const base = normalizeBaseRecord(record)
  if (!base) {
    return base
  }
  if (base.kind === RECORD_KINDS.HIGHLIGHT) {
    return { ...base, style: normalizeHighlightStyle(base.style) }
  }
  return { ...base, style: undefined }
}

export function isHighlightRecord(record: MyZRecord) {
  return getRecordKind(record) === RECORD_KINDS.HIGHLIGHT
}

export function isClipRecord(record: MyZRecord) {
  return getRecordKind(record) === RECORD_KINDS.CLIP
}

export function normalizeColor(
  value: string | undefined,
  fallback: string,
): string {
  const parsed = SanitizedColorSchema.parse(value)
  return parsed ? parsed.toLowerCase() : fallback
}

export function normalizePalette(
  defaults: readonly string[],
  incoming: readonly string[] | undefined,
): string[] {
  const base =
    Array.isArray(incoming) && incoming.length ? [...incoming] : [...defaults]
  const filled: string[] = []
  for (let index = 0; index < 5; index += 1) {
    const fallback: string = defaults[index] ?? defaults[0] ?? "#fde68a"
    const candidate = base[index] ?? fallback
    filled.push(normalizeColor(candidate, fallback))
  }
  return filled
}

export function normalizeWhitespace(value: string): string {
  if (!value) {
    return ""
  }
  return String(value).replace(/\s+/g, " ").trim()
}

export function truncateContent(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value)
  if (!normalized) {
    return ""
  }
  if (typeof maxLength !== "number" || normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength)}…`
}

export function formatNote(value: string): string {
  return truncateContent(value, 120)
}

export function extractPlainText(html?: string): string {
  if (!html) {
    return ""
  }
  const container = document.createElement("div")
  container.innerHTML = html
  return container.textContent || container.innerText || ""
}

export function getRecordPlainText(record: MyZRecord): string {
  if (!record) {
    return ""
  }
  const text = normalizeWhitespace(record.text)
  if (text) {
    return text
  }
  return normalizeWhitespace(extractPlainText(record.html))
}

export function buildMeta(record: MyZRecord): string {
  const created = record.createdAt
    ? new Date(record.createdAt).toLocaleString()
    : ""
  const tags =
    Array.isArray(record.tags) && record.tags.length
      ? `#${record.tags.join(" #")}`
      : ""
  return [created, tags].filter(Boolean).join(" · ")
}
