import { describe, expect, it } from "vitest";
import { z } from "zod";
import { RECORD_KINDS } from "../src/enums";
import { MyZRecordSchema } from "../src/schemas";
import { RECORD_SCHEMA_VERSION } from "../src/versioning";

function record(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: RECORD_SCHEMA_VERSION,
    id: "rec-1",
    kind: RECORD_KINDS.CLIP,
    text: "captured image",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    url: "https://example.com/page",
    ...overrides,
  };
}

/**
 * The previous build's record schema: the same object without the
 * `attachments` field, still `.passthrough()`. This is the executable form of
 * "an old client reads a record it does not fully know".
 */
const OldRecordSchema = z
  .object({
    schemaVersion: z.literal(RECORD_SCHEMA_VERSION),
    schemaId: z.string().optional(),
    id: z.string(),
    kind: z.nativeEnum(RECORD_KINDS),
    text: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    url: z.string(),
  })
  .passthrough();

const attachment = {
  assetId: "asset-1",
  mime: "image/png",
  width: 1280,
  height: 720,
};

describe("record attachments (additive field)", () => {
  it("declares the field in the schema, not only via passthrough", () => {
    // `.passthrough()` alone would keep the field without validating it, so a
    // missing declaration would still round-trip and stay invisible in review.
    const shape = MyZRecordSchema as unknown as {
      shape?: Record<string, unknown>;
    };
    expect(shape.shape?.attachments).toBeDefined();
  });

  it("reads a record written before the field existed", () => {
    const parsed = MyZRecordSchema.safeParse(record());
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.attachments).toBeUndefined();
  });

  it("round-trips a record with attachments unchanged", () => {
    const original = record({ attachments: [attachment] });
    const parsed = MyZRecordSchema.parse(original);
    expect(parsed.attachments).toEqual([attachment]);
    // Survives a JSON round trip, which is what sync and export do.
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(original);
  });

  it("accepts several attachments, since the field is an array", () => {
    const parsed = MyZRecordSchema.parse(
      record({ attachments: [attachment, { ...attachment, assetId: "asset-2" }] }),
    );
    expect(parsed.attachments?.map((entry) => entry.assetId)).toEqual([
      "asset-1",
      "asset-2",
    ]);
  });

  it("rejects an attachment without an assetId", () => {
    expect(
      MyZRecordSchema.safeParse(record({ attachments: [{ mime: "image/png" }] }))
        .success,
    ).toBe(false);
  });

  it("does not crash an old client and keeps the unknown field", () => {
    // Direction the contract cares about most: an older build reading a newer
    // record must neither throw nor drop what it does not know.
    const newer = record({ attachments: [attachment] });
    const parsed = OldRecordSchema.parse(newer);
    expect((parsed as { attachments?: unknown }).attachments).toEqual([
      attachment,
    ]);
  });

  it("keeps attachments when an old client edits tags and writes back", () => {
    // The old build's update path: read the stored object, spread it, patch
    // one field, add schemaVersion — exactly `updateRecordsPatch` +
    // `saveHighlight`.
    const stored = record({ attachments: [attachment], tags: ["before"] });
    const afterOldWrite = {
      ...OldRecordSchema.parse(stored),
      tags: ["after"],
      schemaVersion: RECORD_SCHEMA_VERSION,
    };

    expect(afterOldWrite.attachments).toEqual([attachment]);
    // And the new schema still reads that written-back object.
    const parsed = MyZRecordSchema.safeParse(afterOldWrite);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.attachments).toEqual([attachment]);
    expect(parsed.success && parsed.data.tags).toEqual(["after"]);
  });
});
