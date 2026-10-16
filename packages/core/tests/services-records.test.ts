import type { MyZRecord } from "@myz/shared/types";
import { describe, it, expect, vi } from "vitest";
import type { OpaqueRecord, RecordsStore } from "../src/ports.js";
import {
  createRecord,
  getRecordsForUrls,
  listRecords,
  listTags,
  normalizeIds,
  removeRecords,
  resolveRequestedUrls,
  updateRecord,
  updateRecordRange,
  updateRecordsPatch,
} from "../src/services/records.js";

/** Minimal in-memory RecordsStore for domain-service tests. */
function memoryStore(seed: MyZRecord[] = []): RecordsStore {
  const map = new Map(seed.map((r) => [r.id, r]));
  const opaque = new Map<string, OpaqueRecord>();
  return {
    async get(id) {
      return map.get(id) ?? null;
    },
    async getByUrl(url) {
      return [...map.values()].filter((r) => r.url === url);
    },
    async listAll() {
      return [...map.values()];
    },
    async upsert(record) {
      map.set(record.id, record);
    },
    async remove(id) {
      map.delete(id);
    },
    async putOpaque(record) {
      opaque.set(record.recordId, record);
    },
    async listOpaque() {
      return [...opaque.values()];
    },
    async deleteOpaque(recordId) {
      opaque.delete(recordId);
    },
  };
}

function draft(overrides: Partial<MyZRecord> = {}): Partial<MyZRecord> {
  return {
    text: "hello",
    url: "https://example.com/a",
    kind: "highlight" as MyZRecord["kind"],
    ...overrides,
  };
}

const fixedNow = () => "2026-01-01T00:00:00Z";

describe("record service helpers", () => {
  it("normalizes ids and requested urls", () => {
    expect(normalizeIds([" a ", "a", "", 3])).toEqual(["a"]);
    expect(
      resolveRequestedUrls({ url: "u1", aliases: ["u2", "u1", ""] }),
    ).toEqual(["u1", "u2"]);
  });
});

describe("createRecord", () => {
  it("builds, normalizes, and persists a record with injected id/clock", async () => {
    const store = memoryStore();
    const record = await createRecord(store, draft(), {
      now: fixedNow,
      newId: () => "fixed-id",
    });
    expect(record.id).toBe("fixed-id");
    expect(record.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(record.kind).toBe("highlight");
    expect(await store.get("fixed-id")).toMatchObject({ id: "fixed-id" });
  });

  it("uses the injected htmlToMarkdown port and drops html", async () => {
    const store = memoryStore();
    const htmlToMarkdown = vi.fn(async () => "converted");
    const record = await createRecord(
      store,
      draft({ html: "<p>x</p>", text: "" }),
      { newId: () => "h1", htmlToMarkdown, tabId: 7 },
    );
    expect(htmlToMarkdown).toHaveBeenCalledWith("<p>x</p>", 7);
    expect(record.text).toBe("converted");
    expect(record.html).toBeUndefined();
  });

  it("falls back to tag stripping when the port is absent", async () => {
    const store = memoryStore();
    const record = await createRecord(
      store,
      draft({ html: "<p><b>bold</b> and <i>italic</i></p>", text: "" }),
      { newId: () => "h2" },
    );
    expect(record.text).toContain("bold");
    expect(record.text).toContain("italic");
    expect(record.text).not.toContain("<");
    expect(record.html).toBeUndefined();
  });
});

describe("updateRecord", () => {
  it("merges a patch into an existing record", async () => {
    const store = memoryStore([
      { id: "r1", kind: "highlight", text: "old", url: "u", createdAt: "t", updatedAt: "t" } as MyZRecord,
    ]);
    const updated = await updateRecord(
      store,
      "r1",
      { text: "new" },
      { now: fixedNow },
    );
    expect(updated.text).toBe("new");
    expect(updated.updatedAt).toBe("2026-01-01T00:00:00Z");
  });

  it("throws when the record is missing", async () => {
    const store = memoryStore();
    await expect(updateRecord(store, "missing", {})).rejects.toThrow(
      "Record not found",
    );
  });

  it("replaces only the anchor range", async () => {
    const store = memoryStore([
      { id: "r1", kind: "highlight", text: "t", url: "u", createdAt: "t", updatedAt: "t" } as MyZRecord,
    ]);
    const range = { start: 1, end: 2 } as MyZRecord["range"];
    const updated = await updateRecordRange(store, "r1", range, { now: fixedNow });
    expect(updated.range).toEqual(range);
  });
});

describe("bulk operations", () => {
  it("removes several records", async () => {
    const store = memoryStore([
      { id: "a", kind: "clip", text: "t", url: "u", createdAt: "t", updatedAt: "t" } as MyZRecord,
      { id: "b", kind: "clip", text: "t", url: "u", createdAt: "t", updatedAt: "t" } as MyZRecord,
    ]);
    expect(await removeRecords(store, ["a", "b"])).toBe(2);
    expect(await store.listAll()).toHaveLength(0);
  });

  it("applies a note/tags patch only to existing records", async () => {
    const store = memoryStore([
      { id: "a", kind: "clip", text: "t", url: "u", createdAt: "t", updatedAt: "t" } as MyZRecord,
    ]);
    const count = await updateRecordsPatch(
      store,
      ["a", "missing"],
      { note: " hi ", tags: ["x"] },
      { now: fixedNow },
    );
    expect(count).toBe(2);
    expect(await store.get("a")).toMatchObject({ note: "hi", tags: ["x"] });
  });
});

describe("projections", () => {
  it("lists, tags, and resolves urls without duplicates", async () => {
    const store = memoryStore([
      { id: "a", kind: "clip", text: "t", url: "u1", tags: ["x"], createdAt: "t", updatedAt: "t" } as MyZRecord,
      { id: "b", kind: "clip", text: "t", url: "u2", tags: ["y"], createdAt: "t", updatedAt: "t" } as MyZRecord,
    ]);
    expect(await listRecords(store)).toHaveLength(2);
    expect((await listTags(store)).sort()).toEqual(["x", "y"]);
    const matches = await getRecordsForUrls(store, ["u1", "u1"]);
    expect(matches.map((r) => r.id)).toEqual(["a"]);
  });
});
