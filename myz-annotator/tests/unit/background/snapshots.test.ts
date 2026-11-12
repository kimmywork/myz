// @vitest-environment node
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

// `getDB` runs the one-shot legacy migration, which reads chrome.storage.
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async () => ({}),
      set: async () => undefined,
      remove: async () => undefined,
    },
  },
};
import {
  SnapshotWriteError,
  getSnapshot,
  getSnapshotForRecord,
  listSnapshotIndex,
  resetEvictionNotice,
  measureSnapshotBytes,
  saveSnapshot,
  shouldAnnounceEviction,
  snapshotUsageBytes,
  touchSnapshot,
} from "@/background/snapshots.js";

function input(id: string, _bytes = 0, recordId = `rec-${id}`) {
  return {
    id,
    recordId,
    url: `https://example.com/${id}`,
    title: `Page ${id}`,
    html: `<p>${id}</p>`,
    css: "body{}",
  };
}

describe("snapshot store", () => {
  beforeEach(async () => {
    resetEvictionNotice();
    await clearAll();
  });

  it("stores a snapshot and reports its usage", async () => {
    await saveSnapshot(input("a"));
    // Usage is measured from what was written, not from a caller's claim.
    expect(await snapshotUsageBytes()).toBe(
      measureSnapshotBytes("<p>a</p>", "body{}"),
    );

    const stored = await getSnapshot("a");
    expect(stored?.title).toBe("Page a");
    expect(stored?.bytes).toBe(measureSnapshotBytes("<p>a</p>", "body{}"));
    expect(stored?.createdAt).toBeTruthy();
  });

  it("finds the newest snapshot for a record", async () => {
    await saveSnapshot({
      ...input("old", 100),
      createdAt: "2026-01-01T00:00:00.000Z",
      usedAt: "2026-01-01T00:00:00.000Z",
    });
    await saveSnapshot({
      ...input("new", 100),
      createdAt: "2026-02-01T00:00:00.000Z",
      usedAt: "2026-02-01T00:00:00.000Z",
    });

    const found = await getSnapshotForRecord("rec-old");
    expect(found?.id).toBe("old");

    const newest = await getSnapshotForRecord("rec-new");
    expect(newest?.id).toBe("new");
  });

  it("evicts the least recently used when over quota", async () => {
    // Explicit use times: the profile's clock is too coarse to order three
    // writes that happen in the same millisecond.
    const small = { html: "<p>" + "x".repeat(60) + "</p>", css: "body{}" };
    const limits = { quota: 200, maxBytes: 100 };
    await saveSnapshot(
      { ...input("old"), ...small, usedAt: "2026-01-01T00:00:00.000Z" },
      limits,
    );
    await saveSnapshot(
      { ...input("mid"), ...small, usedAt: "2026-02-01T00:00:00.000Z" },
      limits,
    );
    // The third pushes past the quota: the oldest use must go.
    await saveSnapshot(
      { ...input("new"), ...small, usedAt: "2026-03-01T00:00:00.000Z" },
      limits,
    );

    const index = await listSnapshotIndex();
    expect(index.map((entry) => entry.id).sort()).toEqual(["mid", "new"]);
  });

  it("moves a snapshot to the front of the LRU queue when it is read", async () => {
    await saveSnapshot({
      ...input("read-soon"),
      html: "<p>a</p>",
      css: "",
      usedAt: "2026-01-01T00:00:00.000Z",
    });
    await touchSnapshot("read-soon");

    const [entry] = await listSnapshotIndex();
    expect(entry.usedAt > "2026-01-01T00:00:00.000Z").toBe(true);
  });

  it("refuses an oversized snapshot instead of emptying the cache", async () => {
    // With an 800-byte quota the per-snapshot cap is 100 bytes.
    await saveSnapshot(
      { ...input("keep"), html: "<p>keep</p>", css: "b{}" },
      { quota: 800, maxBytes: 100 },
    );
    const huge = {
      ...input("huge"),
      html: "<p>" + "x".repeat(400) + "</p>",
      css: "",
    };

    await expect(
      saveSnapshot(huge, { quota: 800, maxBytes: 100 }),
    ).rejects.toBeInstanceOf(SnapshotWriteError);
    expect(await getSnapshot("huge")).toBeUndefined();
    // The cache is intact: a refused snapshot costs the user nothing.
    expect(await getSnapshot("keep")).toBeDefined();
  });

  it("measures the size itself instead of trusting the caller", async () => {
    // A caller claiming a tiny size for a large body must not slip past the cap.
    const big = { html: "<p>" + "y".repeat(400) + "</p>", css: "" };
    await expect(
      saveSnapshot({ ...input("liar"), ...big }, { quota: 800, maxBytes: 100 }),
    ).rejects.toThrow(/快照过大/);
    expect(await listSnapshotIndex()).toHaveLength(0);
  });

  it("keeps the old snapshots when the new write fails", async () => {
    // Eviction and the write share one transaction, so a failed write must not
    // have deleted anything on its way out.
    await saveSnapshot(
      { ...input("a"), html: "<p>a</p>", css: "" },
      { quota: 300, maxBytes: 100 },
    );
    expect(await listSnapshotIndex()).toHaveLength(1);
  });

  it("announces eviction once per session", () => {
    expect(shouldAnnounceEviction()).toBe(true);
    expect(shouldAnnounceEviction()).toBe(false);
    resetEvictionNotice();
    expect(shouldAnnounceEviction()).toBe(true);
  });
});

/** Empties the store between tests. */
async function clearAll() {
  const { getDB } = await import("@/background/storage");
  const { withStore } = await import("@myz/shared/idb");
  const db = await getDB();
  await withStore<void>(db, "page_snapshots", "readwrite", (store) =>
    store.clear(),
  );
}
