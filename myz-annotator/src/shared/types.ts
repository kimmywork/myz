import { z } from "zod";
import { MyZRecordSchema } from "./schemas";
import { RECORD_KINDS } from "./enums";

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
