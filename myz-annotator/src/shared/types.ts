import { z } from "zod";
import { MyZRecordSchema } from "./schemas";
import { RECORD_KINDS } from "./enums";

export * from "./enums";

export type MyZRecord = z.infer<typeof MyZRecordSchema>;

export function getRecordKind(record?: Partial<MyZRecord>): RECORD_KINDS {
  if (record && record.kind === RECORD_KINDS.AI_GENERATED) {
    return RECORD_KINDS.AI_GENERATED;
  }
  if (record && record.kind === RECORD_KINDS.CLIP) {
    return RECORD_KINDS.CLIP;
  }
  return RECORD_KINDS.HIGHLIGHT;
}
