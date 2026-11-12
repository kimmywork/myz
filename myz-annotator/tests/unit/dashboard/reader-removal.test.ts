// @vitest-environment node
import { DELETE_UNDO_WINDOW_MS } from "@myz/core/delete-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const removeMock = vi.fn();

/** Minimal chrome.storage.local so the durable removal intent has a home. */
const storage = new Map<string, unknown>();
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async (key: string) => ({ [key]: storage.get(key) }),
      set: async (items: Record<string, unknown>) => {
        Object.entries(items).forEach(([key, value]) =>
          storage.set(key, value),
        );
      },
      remove: async (key: string) => {
        storage.delete(key);
      },
    },
  },
};

vi.mock("@/reader/progress-store", () => ({
  readerProgress: {
    remove: (...args: unknown[]) => removeMock(...args),
    get: vi.fn(async () => undefined),
    clear: vi.fn(),
  },
}));

import { useReaderListRemoval } from "@/dashboard/pages/readers/reader-removal";

const document = {
  key: "epub:myz-epub:local:fp-1",
  kind: "epub" as const,
  sourceKey: "myz-epub:local:fp-1",
  fingerprint: "fp-1",
  title: "Doc A",
};

describe("useReaderListRemoval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    removeMock.mockReset();
    storage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides the row now and drops the shortcut after the window", async () => {
    const reload = vi.fn(async () => undefined);
    const removal = useReaderListRemoval(reload);
    removeMock.mockResolvedValue(undefined);

    expect(await removal.remove(document)).toBe(true);
    expect(removal.hiddenKeys.value.has(document.key)).toBe(true);
    expect(removal.undoMessage.value).toContain("Doc A");
    expect(removeMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS);

    expect(removeMock).toHaveBeenCalledWith(
      "epub",
      document.sourceKey,
      document.fingerprint,
    );
    expect(removal.hiddenKeys.value.has(document.key)).toBe(false);
    expect(reload).toHaveBeenCalled();
  });

  it("undo keeps the shortcut", async () => {
    const removal = useReaderListRemoval(async () => undefined);

    await removal.remove(document);
    expect(await removal.undo()).toBe(true);

    expect(removeMock).not.toHaveBeenCalled();
    expect(removal.hiddenKeys.value.has(document.key)).toBe(false);
    expect(removal.undoMessage.value).toBe("");
  });

  it("restores the row when dropping the shortcut fails", async () => {
    const removal = useReaderListRemoval(async () => undefined);
    removeMock.mockRejectedValue(new Error("idb failed"));

    await removal.remove(document);
    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS);

    expect(removal.hiddenKeys.value.has(document.key)).toBe(false);
    expect(removal.failureMessage.value).toBe("移除失败，已恢复");
  });

  it("applies a removal whose window passed while the page was closed", async () => {
    // Simulates a page that died inside the undo window: the intent is on
    // disk with a due time in the past and no session ever ran.
    storage.set("myz_reader_removal_intents", [
      { ...document, dueAt: Date.now() - 1 },
    ]);
    removeMock.mockResolvedValue(undefined);

    const next = useReaderListRemoval(async () => undefined);
    const applied = await next.settleExpired();

    expect(applied).toBe(1);
    expect(removeMock).toHaveBeenCalledWith(
      "epub",
      document.sourceKey,
      document.fingerprint,
    );
  });

  it("keeps a newer removal undo state when an older commit finishes", async () => {
    const removal = useReaderListRemoval(async () => undefined);
    const other = {
      ...document,
      key: "epub:myz-epub:local:fp-2",
      sourceKey: "myz-epub:local:fp-2",
      fingerprint: "fp-2",
      title: "Doc B",
    };
    let release: () => void = () => undefined;
    removeMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve(undefined);
        }),
    );

    await removal.remove(document);
    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS);
    await Promise.resolve();
    expect(removeMock).toHaveBeenCalledTimes(1);

    await removal.remove(other);
    expect(removal.undoMessage.value).toContain("Doc B");

    release();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(removal.undoMessage.value).toContain("Doc B");
    expect(removal.hiddenKeys.value.has(other.key)).toBe(true);
  });

  it("settleAll finishes pending removals before the list is cleared", async () => {
    const removal = useReaderListRemoval(async () => undefined);
    removeMock.mockResolvedValue(undefined);

    await removal.remove(document);
    expect(removeMock).not.toHaveBeenCalled();

    await removal.settleAll();
    expect(removeMock).toHaveBeenCalledWith(
      "epub",
      document.sourceKey,
      document.fingerprint,
    );
  });

  it("does not delete progress saved after the removal was queued", async () => {
    // The intent is old, but the document was reopened and saved afterwards.
    storage.set("myz_reader_removal_intents", [
      {
        ...document,
        updatedAt: "2026-01-01T00:00:00.000Z",
        dueAt: Date.now() - 1,
      },
    ]);
    const { readerProgress } = await import("@/reader/progress-store");
    vi.mocked(readerProgress.get).mockResolvedValue({
      sourceKey: document.sourceKey,
      updatedAt: "2026-06-01T00:00:00.000Z",
    } as never);
    removeMock.mockResolvedValue(undefined);

    const next = useReaderListRemoval(async () => undefined);
    const applied = await next.settleExpired();

    expect(applied).toBe(0);
    expect(removeMock).not.toHaveBeenCalled();
    // The stale intent is dropped so it cannot fire later either.
    expect(storage.get("myz_reader_removal_intents")).toBeUndefined();
  });

  it("says retry, not restored, when the intent cannot be queued", async () => {
    // No chrome.storage, so persisting the intent fails before anything hides.
    const storage = (
      globalThis as unknown as {
        chrome: { storage: { local: { set: unknown } } };
      }
    ).chrome.storage.local;
    const original = storage.set;
    storage.set = async () => {
      throw new Error("quota");
    };

    const removal = useReaderListRemoval(async () => undefined);
    expect(await removal.remove(document)).toBe(false);
    expect(removal.hiddenKeys.value.size).toBe(0);
    expect(removal.failureMessage.value).toBe("移除失败，请重试");

    storage.set = original;
  });

  it("protects a position saved during the live undo window", async () => {
    const { readerProgress } = await import("@/reader/progress-store");
    const removal = useReaderListRemoval(async () => undefined);
    removeMock.mockResolvedValue(undefined);
    vi.mocked(readerProgress.get).mockResolvedValue({
      sourceKey: document.sourceKey,
      // Saved after the removal was requested.
      updatedAt: "2027-01-01T00:00:00.000Z",
    } as never);

    await removal.remove({
      ...document,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await vi.advanceTimersByTimeAsync(DELETE_UNDO_WINDOW_MS);

    expect(removeMock).not.toHaveBeenCalled();
  });

  it("keeps the intent when the progress read fails during settlement", async () => {
    storage.set("myz_reader_removal_intents", [
      { ...document, dueAt: Date.now() - 1 },
    ]);
    const { readerProgress } = await import("@/reader/progress-store");
    vi.mocked(readerProgress.get).mockImplementation(async () => {
      throw new Error("read failed");
    });

    const next = useReaderListRemoval(async () => undefined);
    const applied = await next.settleExpired();

    expect(applied).toBe(0);
    expect(removeMock).not.toHaveBeenCalled();
    // Still queued for the next attempt.
    expect(storage.get("myz_reader_removal_intents")).toBeDefined();
  });
});
