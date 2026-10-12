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
