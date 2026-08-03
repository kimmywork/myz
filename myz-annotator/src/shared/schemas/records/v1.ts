import { z } from "zod";
import { CONTENT_TYPES, RECORD_KINDS } from "../../enums";
import { RECORD_SCHEMA_VERSION } from "../../versioning";
import { SerializedRangeSchema, HighlightStyleSchema } from "../common";

export const RecordSchemaVersionV1 = RECORD_SCHEMA_VERSION;

export const MyZRecordSchemaV1 = z
  .object({
    schemaVersion: z.literal(RECORD_SCHEMA_VERSION),
    id: z.string(),
    kind: z.nativeEnum(RECORD_KINDS),
    text: z.string(),
    html: z.string().optional(),
    contentType: z.nativeEnum(CONTENT_TYPES).optional(),
    note: z.string().optional(),
    tags: z.array(z.string()).optional(),
    color: z.string().optional(),
    style: HighlightStyleSchema.optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    sourceUrl: z.string().optional(),
    title: z.string().optional(),
    hostname: z.string().optional(),
    range: SerializedRangeSchema.optional(),
    url: z.string(),
    unreachable: z.boolean().optional(),
  })
  .passthrough();

export type MyZRecordV1 = z.infer<typeof MyZRecordSchemaV1>;
