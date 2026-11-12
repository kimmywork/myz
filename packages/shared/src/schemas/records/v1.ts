import { z } from "zod"
import { CONTENT_TYPES, RECORD_KINDS, SOURCE_TYPES } from "../../enums"
import { RECORD_SCHEMA_VERSION } from "../../versioning"
import {
  RecordAttachmentSchema,
  SerializedRangeSchema,
  HighlightStyleSchema,
  PdfLocatorSchema,
  EpubLocatorSchema,
} from "../common"

export const RecordSchemaVersionV1 = RECORD_SCHEMA_VERSION

export const MyZRecordSchemaV1 = z
  .object({
    schemaVersion: z.literal(RECORD_SCHEMA_VERSION),
    /** Payload discriminator (codec id). Absent on legacy records. */
    schemaId: z.string().optional(),
    id: z.string(),
    kind: z.nativeEnum(RECORD_KINDS),
    sourceType: z.nativeEnum(SOURCE_TYPES).optional(),
    pdfLocator: PdfLocatorSchema.optional(),
    epubLocator: EpubLocatorSchema.optional(),
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
    /**
     * Local attachment references (§I7). Optional and additive on purpose: no
     * new `schemaId`, no version bump. `.passthrough()` keeps the field for a
     * client that does not know it yet, and the record write path is
     * `{...existing, ...patch}`, so an older build editing tags keeps it too.
     */
    attachments: z.array(RecordAttachmentSchema).optional(),
  })
  .passthrough()

export type MyZRecordV1 = z.infer<typeof MyZRecordSchemaV1>
