/**
 * Built-in payload codecs for synced records.
 *
 * `schemaId` is the discriminator carried on a record payload; the codec
 * registry maps it back to the validation schema. Sync stays data-agnostic
 * (`data: unknown`); only the dataset boundary consults this registry, so an
 * unknown `schemaId` can be preserved opaquely instead of mis-materialized.
 */
import { MyZRecordSchema } from "@myz/shared/schemas";
import { createPayloadCodecRegistry } from "./payload-codec";

/** Discriminator for the plain `MyZRecord` payload (highlight/clip/bookmark). */
export const RECORD_SCHEMA_ID = "myz.record";

export const recordCodecs = createPayloadCodecRegistry([
  {
    schemaId: RECORD_SCHEMA_ID,
    currentVersion: 1,
    schema: MyZRecordSchema,
  },
]);

/**
 * Resolve a payload's `schemaId`. Records written before the discriminator
 * existed are treated as the default record schema.
 */
export function resolveRecordSchemaId(data: unknown): string {
  if (data && typeof data === "object") {
    const schemaId = (data as { schemaId?: unknown }).schemaId;
    if (typeof schemaId === "string" && schemaId) return schemaId;
  }
  return RECORD_SCHEMA_ID;
}
