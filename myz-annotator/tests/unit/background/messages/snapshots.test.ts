// @vitest-environment node
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async () => ({}),
      set: async () => undefined,
      remove: async () => undefined,
    },
  },
};

import { handleMessage } from "@/background/messages/handler";
import { initializeSnapshotMessageHandlers } from "@/background/messages/snapshots.js";
import {
  listSnapshotIndex,
  resetEvictionNotice,
} from "@/background/snapshots.js";

const ctx = { tabId: 1, trusted: false };

function payload(id: string, bytes = 1024) {
  return {
    recordId: `rec-${id}`,
    url: `https://example.com/${id}`,
    title: `Page ${id}`,
    html: `<p>${id}</p>`,
    css: "body{}",
    bytes,
  };
}

async function clearAll() {
  const { getDB } = await import("@/background/storage");
  const { withStore } = await import("@myz/shared/idb");
  const db = await getDB();
  await withStore<void>(db, "page_snapshots", "readwrite", (store) =>
    store.clear(),
  );
}

describe("snapshot message handlers", () => {
  beforeEach(async () => {
    resetEvictionNotice();
    await clearAll();
    initializeSnapshotMessageHandlers();
  });

  it("stores a snapshot and reads it back for its record", async () => {
    const saved = (await handleMessage(
      "myz:saveSnapshot",
      payload("a"),
      ctx,
    )) as {
      ok: boolean;
      id?: string;
    };
    expect(saved.ok).toBe(true);
    expect(typeof saved.id).toBe("string");

    const found = (await handleMessage(
      "myz:getSnapshotForRecord",
      { recordId: "rec-a" },
      ctx,
    )) as { title?: string } | null;
    expect(found?.title).toBe("Page a");
  });

  it("reports a quota failure instead of a silent success", async () => {
    // Larger than the per-snapshot cap: must come back as a visible error.
    const result = (await handleMessage(
      "myz:saveSnapshot",
      payload("huge", 40 * 1024 * 1024),
      ctx,
    )) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain("快照过大");
    // Nothing was written.
    expect(await listSnapshotIndex()).toHaveLength(0);
  });

  it("rejects an empty body", async () => {
    const result = (await handleMessage(
      "myz:saveSnapshot",
      { ...payload("empty"), html: "" },
      ctx,
    )) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain("正文为空");
  });

  it("announces eviction only the first time in a session", async () => {
    // 9 MB each, 80 MB budget: eight fit (72 MB), the ninth forces one out.
    const big = 9 * 1024 * 1024;
    for (const id of [
      "one",
      "fill-0",
      "fill-1",
      "fill-2",
      "fill-3",
      "fill-4",
      "fill-5",
      "fill-6",
    ]) {
      const result = (await handleMessage(
        "myz:saveSnapshot",
        payload(id, big),
        ctx,
      )) as { ok: boolean; evicted?: string[] };
      expect(result.ok).toBe(true);
      // Nothing has been evicted yet: 72 MB is inside the 80 MB budget.
      expect(result.evicted).toEqual([]);
    }
    expect(await listSnapshotIndex()).toHaveLength(8);

    const causing = (await handleMessage(
      "myz:saveSnapshot",
      payload("causing", big),
      ctx,
    )) as { ok: boolean; evicted?: string[]; announceEviction?: boolean };
    expect(causing.ok).toBe(true);
    expect((causing.evicted ?? []).length).toBeGreaterThan(0);
    expect(causing.announceEviction).toBe(true);

    const again = (await handleMessage(
      "myz:saveSnapshot",
      payload("again", big),
      ctx,
    )) as { ok: boolean; announceEviction?: boolean };
    expect(again.ok).toBe(true);
    // Same session: the user has already been told once.
    expect(again.announceEviction).toBe(false);
  }, 30_000);

  it("reports the usage line", async () => {
    const usage = (await handleMessage(
      "myz:getSnapshotUsage",
      undefined,
      ctx,
    )) as { statusLine: string };
    expect(usage.statusLine).toContain("本机快照 · 占用");
    expect(usage.statusLine).toContain("最旧的会被清理");
  });
});
