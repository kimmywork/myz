import { RECORD_KINDS, getRecordKind, type MyZRecord } from "./types.ts"

/**
 * Human readable label for a record kind. Shared by the dashboard, popup and
 * inbox so the wording cannot drift between surfaces.
 */
export function recordKindLabel(kind: RECORD_KINDS): string {
  switch (kind) {
    case RECORD_KINDS.CLIP:
      return "摘录"
    case RECORD_KINDS.BOOKMARK:
      return "来源"
    default:
      return "划线"
  }
}

/** Human readable label for a record, derived from its resolved kind. */
export function getRecordKindLabel(record: MyZRecord): string {
  return recordKindLabel(getRecordKind(record))
}

/**
 * Format an ISO timestamp for display. An explicit locale may be supplied by
 * hosts that need deterministic output; by default the runtime locale is used.
 */
export function formatDateTime(
  value: string | undefined,
  locale?: string,
): string {
  if (!value) {
    return ""
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString(locale)
}

/**
 * Best-effort hostname for a record, preferring the value stored on the record
 * and falling back to parsing its URL.
 */
export function hostnameForRecord(record: Partial<MyZRecord>): string {
  if (record?.hostname) {
    return record.hostname
  }
  const url = record?.url || record?.sourceUrl || ""
  try {
    return new URL(url).hostname || ""
  } catch {
    return ""
  }
}

/**
 * Markdown export of a single record, shared by the dashboard, popup and the
 * content script so the copied text is identical everywhere.
 */
export function recordToMarkdown(record: MyZRecord): string {
  const tags =
    Array.isArray(record?.tags) && record.tags.length
      ? ` #${record.tags.join(" #")}`
      : ""
  const quote = (record?.text || "")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
  const note = record?.note ? `\n\n${record.note}` : ""
  const link = record?.sourceUrl || record?.url || ""
  const title = record?.title || record?.hostname || "页面"
  return `- **${title}**${tags} ([链接](${link}))\n${quote}${note}`
}

/**
 * Best-effort plain text for a Markdown record. Used only to locate a quote in
 * a saved snapshot (whose body is flattened DOM text) — display still renders
 * the original Markdown. This is deliberately a small syntax-stripper, not a
 * Markdown parser: it only needs to remove characters that cannot occur in the
 * flattened DOM text (emphasis, code ticks, link syntax, list/quote markers).
 */
export function markdownToPlainText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.slice(3, -3))
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1$2")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1$2")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}([-*+]|\d+\.)\s+/gm, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Defuddle inserts spaces around inline markup: "**高效** ：" and
    // "相比， `code`". The snapshot's DOM text has none of those. Drop the
    // spaces before CJK punctuation and after 、/， before Latin text, but
    // keep the list-item separators (newlines -> spaces) that the snapshot
    // also inserts after each block.
    .replace(/\s+([，。：；！？、）】》」』])/g, "$1")
    .replace(/([，、])\s+(?=[A-Za-z0-9])/g, "$1")
    // Defuddle also puts a space around inline <a>/<strong> between CJK
    // characters (公开<a>原生</a> → "公开 原生"); the DOM text has none.
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, "$1")
}

/**
 * The text to compare against a snapshot. New records carry an explicit plain
 * `anchorText` captured from the selection HTML; older ones only have the
 * Markdown `text` and are normalized on the fly.
 */
export function recordAnchorText(
  record: Pick<MyZRecord, "text"> & { anchorText?: string },
): string {
  const explicit = record.anchorText
  return explicit && explicit.trim() ? explicit : markdownToPlainText(record.text || "")
}

/**
 * Local-time `YYYY-MM-DD` key for a timestamp, or `""` when it is missing or
 * unparseable (so an invalid date never silently buckets into 1970).
 *
 * Local, not UTC: date filters and grouping compare against dates the user
 * picked, which are local.
 */
export function localDateKey(value: string | undefined): string {
  if (!value) return "";
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  const date = new Date(time);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
