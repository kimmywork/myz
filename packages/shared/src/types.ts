import { z } from "zod"
import { CONTENT_TYPES, RECORD_KINDS, SOURCE_TYPES } from "./enums"
import { hasMarkdown } from "./markdownRenderer"
import { MyZRecordRegistry } from "./recordRegistry"
import { MyZRecordSchema } from "./schemas"
import { isRecord } from "./typeUtils"
import { RECORD_SCHEMA_VERSION, type RecordSchemaVersion } from "./versioning"

export * from "./enums"

export type MyZRecord = z.infer<typeof MyZRecordSchema>

export const MYZ_RECORD_SCHEMA_VERSION = RECORD_SCHEMA_VERSION
export type MyZRecordSchemaVersion = RecordSchemaVersion

export function ensureRecordSchemaVersion<T extends Partial<MyZRecord>>(
  record: T,
): T & { schemaVersion: MyZRecordSchemaVersion } {
  const schemaVersion =
    typeof record?.schemaVersion === "string" && record.schemaVersion
      ? record.schemaVersion
      : RECORD_SCHEMA_VERSION
  return { ...record, schemaVersion } as T & {
    schemaVersion: MyZRecordSchemaVersion
  }
}

export function getRecordKind(record?: Partial<MyZRecord>): RECORD_KINDS {
  const kind = record?.kind
  if (typeof kind === "string") {
    const normalized = kind.trim()
    if (
      normalized &&
      Object.values(RECORD_KINDS).includes(normalized as RECORD_KINDS)
    ) {
      return normalized as RECORD_KINDS
    }
  }
  return RECORD_KINDS.HIGHLIGHT
}

export function isHighlightKind(kind: unknown): kind is RECORD_KINDS.HIGHLIGHT {
  return kind === RECORD_KINDS.HIGHLIGHT
}

export function normalizeContentType(
  value: unknown,
): CONTENT_TYPES | undefined {
  if (!value) {
    return undefined
  }
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) {
    return undefined
  }
  return (Object.values(CONTENT_TYPES) as string[]).includes(normalized)
    ? (normalized as CONTENT_TYPES)
    : undefined
}

export function normalizeSourceType(
  value: unknown,
): SOURCE_TYPES | undefined {
  if (!value) {
    return undefined
  }
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) {
    return undefined
  }
  return (Object.values(SOURCE_TYPES) as string[]).includes(normalized)
    ? (normalized as SOURCE_TYPES)
    : undefined
}

/** Old records without an explicit source type are treated as web pages. */
export function resolveRecordSourceType(
  record: Partial<MyZRecord>,
): SOURCE_TYPES {
  return normalizeSourceType(record?.sourceType) ?? SOURCE_TYPES.WEB
}

export function resolveRecordContentType(
  record: Partial<MyZRecord>,
): CONTENT_TYPES {
  const normalized = normalizeContentType(record?.contentType)
  if (normalized) {
    return normalized
  }
  const text = typeof record?.text === "string" ? record.text.trim() : ""
  if (text) {
    if (hasMarkdown(text)) {
      return CONTENT_TYPES.MARKDOWN
    }
    return CONTENT_TYPES.PLAIN
  }
  const html = typeof record?.html === "string" ? record.html.trim() : ""
  if (html) {
    return CONTENT_TYPES.HTML
  }
  return CONTENT_TYPES.PLAIN
}

export function normalizeRecord(record?: unknown): MyZRecord | null {
  if (!isRecord(record)) {
    return null
  }
  const recordWithKind: Partial<MyZRecord> = {
    ...(record as Partial<MyZRecord>),
    kind: getRecordKind(record as Partial<MyZRecord>),
  }
  const versioned = ensureRecordSchemaVersion(recordWithKind)
  versioned.contentType = resolveRecordContentType(versioned)
  versioned.sourceType = resolveRecordSourceType(versioned)

  const schema = MyZRecordRegistry.versions[MYZ_RECORD_SCHEMA_VERSION]
  const result = schema.safeParse(versioned)
  if (!result.success) {
    console.warn("Record validation failed", result.error)
    return null
  }
  // The schema already normalizes `style` for highlights; non-highlight
  // records (clips/bookmarks) must not carry a highlight style.
  if (result.data.kind !== RECORD_KINDS.HIGHLIGHT) {
    return { ...result.data, style: undefined }
  }
  return result.data
}
