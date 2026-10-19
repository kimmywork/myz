import { describe, expect, it } from "vitest";
import {
  RECORD_SCHEMA_ID,
  recordCodecs,
  resolveRecordSchemaId,
} from "../src/record-codecs.js";

describe("record codecs", () => {
  it("defaults a missing discriminator to the record schema id", () => {
    expect(resolveRecordSchemaId({})).toBe(RECORD_SCHEMA_ID);
    expect(resolveRecordSchemaId(null)).toBe(RECORD_SCHEMA_ID);
    expect(resolveRecordSchemaId(undefined)).toBe(RECORD_SCHEMA_ID);
    expect(resolveRecordSchemaId({ schemaId: "" })).toBe(RECORD_SCHEMA_ID);
  });

  it("keeps an explicit schemaId", () => {
    expect(resolveRecordSchemaId({ schemaId: "future.kind" })).toBe(
      "future.kind",
    );
  });

  it("registers the built-in record codec", () => {
    expect(recordCodecs.has(RECORD_SCHEMA_ID)).toBe(true);
    expect(recordCodecs.get(RECORD_SCHEMA_ID)?.currentVersion).toBe(1);
    expect(recordCodecs.has("future.kind")).toBe(false);
  });
});
