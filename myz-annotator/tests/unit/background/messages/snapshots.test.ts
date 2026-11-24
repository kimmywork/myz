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

  it("stores a snapshot and reads the page's copy back", async () => {
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
      "myz:getSnapshotsForPage",
      { url: "https://example.com/a" },
      ctx,
    )) as Array<{ title?: string }>;
    expect(found).toHaveLength(1);
    expect(found[0]?.title).toBe("Page a");
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

  it("prunes legacy duplicates on read, keeping the newest copy", async () => {
    // 2026-11-24：一页只保留最新版本。替换制之前遗留的多版本在读取时收敛。
    // 两条必须**直接写进存储**：走两次 saveSnapshot 的话第二次已经替换掉
    // 第一条，这条用例就算删掉「读取即清理」也照样过（CodeRabbit #136）。
    const url = "https://example.com/first";
    const seed = async (id: string, title: string, createdAt: string) => {
      const { getDB } = await import("@/background/storage");
      const { withStore } = await import("@myz/shared/idb");
      const db = await getDB();
      await withStore<void>(db, "page_snapshots", "readwrite", (store) =>
        store.put({
          id,
          url,
          title,
          html: `<p>${title}</p>`,
          css: "",
          bytes: 64,
          createdAt,
          usedAt: createdAt,
        }),
      );
    };
    await seed("legacy-old", "Page old", "2026-11-20T00:00:00.000Z");
    await seed("legacy-new", "Page new", "2026-11-23T00:00:00.000Z");
    expect(await listSnapshotIndex()).toHaveLength(2);

    const found = (await handleMessage(
      "myz:getSnapshotsForPage",
      { url },
      ctx,
    )) as Array<{ title?: string }>;
    expect(found).toHaveLength(1);
    expect(found[0]?.title).toBe("Page new");
    // 读取即清理：存储里也只剩这一条。
    expect(await listSnapshotIndex()).toHaveLength(1);
  });
});
