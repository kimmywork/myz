import { RECORD_KINDS, type MyZRecord } from "@myz/shared/types";
import { RECORD_SCHEMA_VERSION } from "@myz/shared/versioning";
import { describe, expect, it } from "vitest";
import { mergeImportedRecords } from "../src/import-merge.js";

const range = {
  start: { charOffset: 0, path: [{ name: "p", index: 0 }] },
  end: { charOffset: 5, path: [{ name: "p", index: 0 }] },
};

function record(overrides: Record<string, unknown> = {}): MyZRecord {
  return {
    schemaVersion: RECORD_SCHEMA_VERSION,
    id: "r1",
    kind: RECORD_KINDS.HIGHLIGHT,
    text: "hello",
    url: "https://example.com/a",
    range,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as MyZRecord;
}

describe("mergeImportedRecords", () => {
  it("skip keeps the existing record", () => {
    const result = mergeImportedRecords(
      { r1: record() },
      [record({ text: "new" })],
      "skip",
    );
    expect(result.replacements.size).toBe(0);
    expect(result.additions.size).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("overwrite replaces the existing record", () => {
    const result = mergeImportedRecords(
      { r1: record() },
      [record({ text: "new" })],
      "overwrite",
    );
    expect(result.replacements.get("r1")?.text).toBe("new");
    expect(result.additions.size).toBe(0);
  });

  it("latest replaces only when the incoming record is newer", () => {
    const existing = { r1: record({ updatedAt: "2026-01-02T00:00:00.000Z" }) };
    const older = mergeImportedRecords(
      existing,
      [record({ updatedAt: "2026-01-01T00:00:00.000Z" })],
      "latest",
    );
    expect(older.replacements.size).toBe(0);
    expect(older.skipped).toBe(1);

    const newer = mergeImportedRecords(
      existing,
      [record({ text: "new", updatedAt: "2026-01-03T00:00:00.000Z" })],
      "latest",
    );
    expect(newer.replacements.get("r1")?.text).toBe("new");
  });

  it("adds a new record and de-duplicates by signature", () => {
    const result = mergeImportedRecords(
      {},
      [record({ id: "a" }), record({ id: "b" })],
      "skip",
    );
    // Same url + range → same signature; the second is skipped.
    expect(result.additions.size).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("skips records that fail import sanitization", () => {
    const result = mergeImportedRecords(
      {},
      [{ id: "broken" } as MyZRecord],
      "skip",
    );
    expect(result.additions.size).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
