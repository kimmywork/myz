// @vitest-environment node
import { DELETE_UNDO_WINDOW_MS } from "@myz/core/delete-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const removeMock = vi.fn();
vi.mock("@/reader/progress-store", () => ({
  readerProgress: {
    remove: (...args: unknown[]) => removeMock(...args),
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
});
