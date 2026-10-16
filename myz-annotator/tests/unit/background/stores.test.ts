import "fake-indexeddb/auto";
import type { MyZRecord } from "@myz/shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { inboxStateStore, recordsStore } from "@/background/stores";

function record(id: string, overrides: Partial<MyZRecord> = {}): MyZRecord {
  return {
    id,
    kind: "highlight" as MyZRecord["kind"],
    text: `text-${id}`,
    url: "https://example.com/a",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as MyZRecord;
}

describe("recordsStore (IndexedDB contract)", () => {
  beforeEach(() => {
    // `getDB()` runs a legacy chrome.storage → IndexedDB migration; stub the
    // chrome surface so it no-ops in the test environment.
    vi.stubGlobal("chrome", {
      storage: { local: { get: async () => ({}), remove: async () => {} } },
    });
  });

  it("upserts, reads, lists, and removes a record", async () => {
    await recordsStore.upsert(record("r1"));
    expect(await recordsStore.get("r1")).toMatchObject({ id: "r1" });

    const all = await recordsStore.listAll();
    expect(all.map((r) => r.id)).toContain("r1");

    await recordsStore.remove("r1");
    expect(await recordsStore.get("r1")).toBeNull();
  });

  it("finds records by url", async () => {
    await recordsStore.upsert(record("u1", { url: "https://example.com/x" }));
    const matches = await recordsStore.getByUrl("https://example.com/x");
    expect(matches.map((r) => r.id)).toContain("u1");
    expect(await recordsStore.getByUrl("https://example.com/none")).toEqual([]);
  });

  it("round-trips opaque records (D1)", async () => {
    const opaque = {
      streamId: "highlights",
      recordId: "n:unknown-1",
      updatedAt: "2026-02-02T00:00:00Z",
      data: { schemaId: "future.kind", body: "keep me" },
    };
    await recordsStore.putOpaque(opaque);
    const list = await recordsStore.listOpaque();
    const found = list.find((entry) => entry.recordId === "n:unknown-1");
    expect(found).toEqual(opaque);
    expect(await recordsStore.listOpaque("inbox")).toEqual([]);
    expect(await recordsStore.listOpaque("highlights")).toHaveLength(1);

    await recordsStore.deleteOpaque("n:unknown-1");
    expect(
      (await recordsStore.listOpaque()).find(
        (entry) => entry.recordId === "n:unknown-1",
      ),
    ).toBeUndefined();
  });
});

describe("inboxStateStore (IndexedDB contract)", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      storage: { local: { get: async () => ({}), remove: async () => {} } },
    });
  });

  it("round-trips a status row", async () => {
    await inboxStateStore.put({
      recordId: "status:h:1",
      kind: "status",
      changedAt: "2026-01-01T00:00:00Z",
      payload: { status: "pending" },
    });
    const found = await inboxStateStore.get("status:h:1");
    expect(found?.kind).toBe("status");
    expect(found?.payload).toEqual({ status: "pending" });

    await inboxStateStore.remove("status:h:1");
    expect(await inboxStateStore.get("status:h:1")).toBeUndefined();
  });
});
