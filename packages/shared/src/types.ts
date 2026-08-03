import { z } from "zod"
import { CONTENT_TYPES, RECORD_KINDS } from "./enums"
import { MyZRecordSchema } from "./schemas"
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

export function resolveRecordContentType(
  record: Partial<MyZRecord>,
): CONTENT_TYPES {
  const normalized = normalizeContentType(record?.contentType)
  if (normalized) {
    return normalized
  }
  const html = typeof record?.html === "string" ? record.html.trim() : ""
  if (html) {
    return CONTENT_TYPES.HTML
  }
  return CONTENT_TYPES.PLAIN
}
