import { z } from "zod";
import { MyZRecordSchema } from "./schemas";
import { CONTENT_TYPES, RECORD_KINDS } from "./enums";

export * from "./enums";

export type MyZRecord = z.infer<typeof MyZRecordSchema>;

export function getRecordKind(record?: Partial<MyZRecord>): RECORD_KINDS {
  const kind = record?.kind;
  if (typeof kind === "string") {
    const normalized = kind.trim();
    if (
      normalized &&
      Object.values(RECORD_KINDS).includes(normalized as RECORD_KINDS)
    ) {
      return normalized as RECORD_KINDS;
    }
  }
  return RECORD_KINDS.HIGHLIGHT;
}

export function isHighlightKind(kind: unknown): kind is RECORD_KINDS.HIGHLIGHT {
  return kind === RECORD_KINDS.HIGHLIGHT;
}

export function normalizeContentType(
  value: unknown,
): CONTENT_TYPES | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  return (Object.values(CONTENT_TYPES) as string[]).includes(normalized)
    ? (normalized as CONTENT_TYPES)
    : undefined;
}

export function resolveRecordContentType(
  record: Partial<MyZRecord>,
): CONTENT_TYPES {
  const normalized = normalizeContentType((record as any)?.contentType);
  if (normalized) {
    return normalized;
  }
  const kind = getRecordKind(record);
  if (kind === RECORD_KINDS.AI_GENERATED) {
    return CONTENT_TYPES.MARKDOWN;
  }
  const html = typeof record?.html === "string" ? record.html.trim() : "";
  if (html) {
    return CONTENT_TYPES.HTML;
  }
  return CONTENT_TYPES.PLAIN;
}
