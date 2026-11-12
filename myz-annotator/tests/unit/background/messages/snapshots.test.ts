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

  it("measures the body itself, so a small claim cannot bypass the cap", async () => {
    // The payload's `bytes` is advisory: a 40 MB body must be refused even if
    // the caller claims it is tiny. Quota math itself is unit-tested against
    // the store with injected limits.
    const result = (await handleMessage(
      "myz:saveSnapshot",
      {
        ...payload("huge"),
        html: "<p>" + "x".repeat(11 * 1024 * 1024) + "</p>",
      },
      ctx,
    )) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).toContain("快照过大");
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
