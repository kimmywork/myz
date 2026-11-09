import type { MyZRecord } from "@myz/shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPendingDelete,
  PENDING_DELETE_WINDOW_MS,
} from "../../../src/content/highlight/pending-delete";

function recordOf(id: string): MyZRecord {
  return { id, text: `text-${id}` } as unknown as MyZRecord;
}

describe("createPendingDelete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("只有撤销窗口结束后才写入存储", async () => {
    const commit = vi.fn(async () => true);
    const onCommitted = vi.fn();
    const controller = createPendingDelete({
      commit,
      restore: () => true,
      onCommitted,
    });

    controller.schedule(recordOf("a"));
    expect(controller.has("a")).toBe(true);

    await vi.advanceTimersByTimeAsync(PENDING_DELETE_WINDOW_MS - 1);
    expect(commit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledWith("a");
    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(controller.has("a")).toBe(false);
  });

  it("撤销后不再提交，并就地恢复记录", async () => {
    const commit = vi.fn(async () => true);
    const restore = vi.fn(() => true);
    const onUndone = vi.fn();
    const controller = createPendingDelete({ commit, restore, onUndone });

    const record = recordOf("b");
    controller.schedule(record);
    expect(controller.undo("b")).toBe(true);
    expect(restore).toHaveBeenCalledWith(record);
    expect(onUndone).toHaveBeenCalledWith(record, true);

    await vi.advanceTimersByTimeAsync(PENDING_DELETE_WINDOW_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  it("恢复失败时告知调用方，记录仍留在存储里", async () => {
    const commit = vi.fn(async () => true);
    const controller = createPendingDelete({
      commit,
      restore: () => false,
      onUndone: (_record, restored) => {
        expect(restored).toBe(false);
      },
    });

    controller.schedule(recordOf("c"));
    controller.undo("c");

    await vi.advanceTimersByTimeAsync(PENDING_DELETE_WINDOW_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  it("提交失败时恢复划线并回调失败", async () => {
    const restore = vi.fn(() => true);
    const onCommitFailed = vi.fn();
    const controller = createPendingDelete({
      commit: async () => false,
      restore,
      onCommitFailed,
    });

    controller.schedule(recordOf("d"));
    await vi.advanceTimersByTimeAsync(PENDING_DELETE_WINDOW_MS);

    expect(restore).toHaveBeenCalledTimes(1);
    expect(onCommitFailed).toHaveBeenCalledWith(expect.anything(), true);
  });

  it("重复撤销是幂等的", () => {
    const restore = vi.fn(() => true);
    const controller = createPendingDelete({
      commit: async () => true,
      restore,
    });

    controller.schedule(recordOf("e"));
    expect(controller.undo("e")).toBe(true);
    expect(controller.undo("e")).toBe(false);
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it("dispose 清掉定时器且不提交", async () => {
    const commit = vi.fn(async () => true);
    const controller = createPendingDelete({
      commit,
      restore: () => true,
    });

    controller.schedule(recordOf("f"));
    controller.dispose();
    await vi.advanceTimersByTimeAsync(PENDING_DELETE_WINDOW_MS * 2);

    expect(commit).not.toHaveBeenCalled();
    expect(controller.has("f")).toBe(false);
  });
});
