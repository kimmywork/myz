// @vitest-environment node
import { DELETE_UNDO_WINDOW_MS } from "@myz/core/delete-session";
import type { StagedAssetMeta } from "@myz/core/staged-asset";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/messaging/invoke.js", () => ({ invoke: vi.fn() }));

import {
  lastAssetRemovalFailures,
  useAssetsRemoval,
} from "@/dashboard/pages/assets/use-assets-removal";

const invokeMock = vi.mocked(invoke);
import {
  assetKindLabel,
  assetSourceLabel,
  formatBytes,
  useStagedAssets,
} from "@/dashboard/pages/assets/use-staged-assets";

import { invoke } from "@/messaging/invoke.js";

function asset(
  id: string,
  overrides: Partial<StagedAssetMeta> = {},
): StagedAssetMeta {
  return {
    id,
    name: `asset ${id}`,
    mime: "image/png",
    width: 8,
    height: 6,
    thumb: "data:image/png;base64,xxx",
    sourceKind: "image",
    createdAt: "2026-01-01T00:00:00.000Z",
    size: 1024,
    ...overrides,
  } as StagedAssetMeta;
}

describe("useStagedAssets", () => {
  it("lists the cache and reports its total size", async () => {
    invokeMock.mockResolvedValue([asset("a"), asset("b", { size: 2048 })]);
    const state = useStagedAssets();

    await state.reload();

    expect(state.assets.value).toHaveLength(2);
    expect(state.usageText.value).toBe("2 张 · 共 3 KB");
    expect(state.error.value).toBe("");
  });

  it("surfaces a read failure instead of an empty cache", async () => {
    invokeMock.mockImplementation(async () => {
      throw new Error("offline");
    });
    const state = useStagedAssets();

    // `reload` must swallow the failure and surface it as page state.
    await expect(state.reload()).resolves.toBeUndefined();

    expect(state.assets.value).toEqual([]);
    expect(state.error.value).toContain("读取缓存区失败");
  });

  it("forgets committed ids locally", async () => {
    invokeMock.mockResolvedValue([asset("a"), asset("b")]);
    const state = useStagedAssets();
    await state.reload();

    state.forget(["a"]);

    expect(state.assets.value.map((entry) => entry.id)).toEqual(["b"]);
  });
});

describe("asset helpers", () => {
  it("formats sizes and labels", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(assetKindLabel("video-frame")).toBe("视频帧");
    expect(assetKindLabel("nope")).toBe("图片");
    expect(assetSourceLabel(asset("a"))).toBe("本地文件");
    expect(
      assetSourceLabel(asset("a", { sourceUrl: "https://example.com/x" })),
    ).toBe("example.com");
  });
});

describe("useAssetsRemoval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("hides a batch now and deletes the bytes after the window", async () => {
    invokeMock.mockResolvedValue({ ok: true });
    const reload = vi.fn(async () => undefined);
    const removal = useAssetsRemoval(reload);

    await removal.remove([asset("a"), asset("b")]);

    expect([...removal.hiddenIds.value].sort()).toEqual(["a", "b"]);
    expect(removal.undoMessage.value).toBe("已删除 2 张素材");
    expect(invokeMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS);

    expect(invokeMock).toHaveBeenCalledWith("myz:deleteStagedAsset", {
      id: "a",
    });
    expect(invokeMock).toHaveBeenCalledWith("myz:deleteStagedAsset", {
      id: "b",
    });
    expect(removal.hiddenIds.value.size).toBe(0);
    expect(reload).toHaveBeenCalled();
  });

  it("undo restores the batch without deleting anything", async () => {
    invokeMock.mockResolvedValue({ ok: true });
    const removal = useAssetsRemoval(async () => undefined);

    await removal.remove([asset("a"), asset("b")]);
    expect(await removal.undo()).toBe(true);

    expect(invokeMock).not.toHaveBeenCalled();
    expect(removal.hiddenIds.value.size).toBe(0);
    expect(removal.undoMessage.value).toBe("");
  });

  it("restores the rows when the delete fails", async () => {
    invokeMock.mockResolvedValue({ ok: false });
    const removal = useAssetsRemoval(async () => undefined);

    await removal.remove([asset("a")]);
    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS);

    expect(removal.hiddenIds.value.size).toBe(0);
    expect(removal.failureMessage.value).toBe("部分素材未能删除，列表已刷新");
  });

  it("keeps deleting after one capture fails and reports the survivors", async () => {
    // Second capture fails; the third must still be attempted, otherwise rows
    // whose bytes are already gone would stay in the list.
    invokeMock
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    const removal = useAssetsRemoval(async () => undefined);

    await removal.remove([asset("a"), asset("b"), asset("c")]);
    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS);

    expect(invokeMock).toHaveBeenCalledTimes(3);
    expect(removal.failureMessage.value).toBe("部分素材未能删除，列表已刷新");
    expect(lastAssetRemovalFailures()).toBe(1);
    // Nothing is left hidden: the list reload shows what really survived.
    expect(removal.hiddenIds.value.size).toBe(0);
  });
});
