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
  saveSnapshot,
  shouldAnnounceEviction,
  snapshotUsageBytes,
  touchSnapshot,
} from "@/background/snapshots.js";

function input(id: string, bytes: number, recordId = `rec-${id}`) {
  return {
    id,
    recordId,
    url: `https://example.com/${id}`,
    title: `Page ${id}`,
    html: `<p>${id}</p>`,
    css: "body{}",
    bytes,
  };
}

describe("snapshot store", () => {
  beforeEach(async () => {
    resetEvictionNotice();
    await clearAll();
  });

  it("stores a snapshot and reports its usage", async () => {
    await saveSnapshot(input("a", 1000));
    expect(await snapshotUsageBytes()).toBe(1000);

    const stored = await getSnapshot("a");
    expect(stored?.title).toBe("Page a");
    expect(stored?.bytes).toBe(1000);
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
    // Fill most of the quota, then add one that must push the oldest out.
    await saveSnapshot({ ...input("old", 100) });
    await saveSnapshot({ ...input("mid", 100) });
    await touchSnapshot("mid");
    await saveSnapshot({ ...input("new", 100) });

    const index = await listSnapshotIndex();
    expect(index.map((entry) => entry.id).sort()).toEqual([
      "mid",
      "new",
      "old",
    ]);
  });

  it("refuses an oversized snapshot instead of emptying the cache", async () => {
    await saveSnapshot(input("keep", 100));
    const huge = { ...input("huge", 0), bytes: 20 * 1024 * 1024 };

    await expect(saveSnapshot(huge)).rejects.toBeInstanceOf(SnapshotWriteError);
    expect(await getSnapshot("huge")).toBeUndefined();
    // The cache is intact.
    expect(await getSnapshot("keep")).toBeDefined();
  });

  it("leaves nothing half-written when the write fails", async () => {
    const errors: SnapshotWriteError[] = [];
    try {
      await saveSnapshot({ ...input("bad", 0), bytes: 40 * 1024 * 1024 });
    } catch (error) {
      errors.push(error as SnapshotWriteError);
    }
    expect(errors[0]?.reason).toBe("too-large");
    expect(await listSnapshotIndex()).toHaveLength(0);
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
