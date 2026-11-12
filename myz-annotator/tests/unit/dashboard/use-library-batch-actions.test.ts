// @vitest-environment node
import type { MyZRecord } from "@myz/shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";

const invokeMock = vi.fn();
vi.mock("@/messaging/invoke", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const store = {
  loadHighlights: vi.fn(async () => undefined),
  refreshHighlights: vi.fn(async () => undefined),
  setOperationStatus: vi.fn(),
  handleExport: vi.fn(async () => true),
};
vi.mock("@/dashboard/stores/highlights", () => ({
  useHighlightsStore: () => store,
}));

const deleteStore = {
  requestDelete: vi.fn(async () => true),
};
vi.mock("@/dashboard/stores/delete", () => ({
  useDeleteStore: () => deleteStore,
}));

import { useLibraryBatchActions } from "@/dashboard/composables/useLibraryBatchActions";

function record(id: string, tags: string[] = []): MyZRecord {
  return { id, text: `text ${id}`, tags } as MyZRecord;
}

function setup(records: MyZRecord[]) {
  const list = ref(records);
  const clearSelection = vi.fn();
  const actions = useLibraryBatchActions({
    selectedRecords: computed(() => list.value),
    clearSelection,
  });
  return { actions, clearSelection, list };
}

describe("useLibraryBatchActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.handleExport.mockResolvedValue(true);
    store.loadHighlights.mockResolvedValue(undefined);
  });

  it("reports a partial batch-tag failure instead of silence", async () => {
    const { actions, clearSelection } = setup([
      record("a"),
      record("b"),
      record("c"),
    ]);
    invokeMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({});
    actions.bulkTag.value = "tag";

    await actions.applyBulkTag();

    expect(invokeMock).toHaveBeenCalledTimes(3);
    expect(store.loadHighlights).toHaveBeenCalled();
    expect(store.setOperationStatus).toHaveBeenCalledWith(
      expect.stringContaining("部分完成"),
      5000,
    );
    expect(clearSelection).toHaveBeenCalled();
  });

  it("does not stack a second tag submission while the first runs", async () => {
    const { actions } = setup([record("a")]);
    let release: () => void = () => undefined;
    invokeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({});
        }),
    );
    actions.bulkTag.value = "first";

    const first = actions.applyBulkTag();
    actions.bulkTag.value = "second";
    await actions.applyBulkTag(); // guarded: returns immediately

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect((invokeMock.mock.calls[0][1] as { tags: string[] }).tags).toEqual([
      "first",
    ]);

    release();
    await first;
  });

  it("does not claim an export succeeded when it failed", async () => {
    const { actions } = setup([record("a")]);
    store.handleExport.mockResolvedValue(false);

    await actions.exportSelected();

    expect(store.handleExport).toHaveBeenCalledTimes(1);
    expect(store.setOperationStatus).not.toHaveBeenCalledWith(
      expect.stringContaining("已导出"),
      expect.anything(),
    );
  });

  it("does not schedule the same batch delete twice", async () => {
    const { actions } = setup([record("a")]);
    let release: () => void = () => undefined;
    deleteStore.requestDelete.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          release = () => resolve(true);
        }),
    );

    actions.deleteSelected();
    actions.deleteSelected(); // guarded: one intent per click burst

    expect(deleteStore.requestDelete).toHaveBeenCalledTimes(1);
    release();
    await Promise.resolve();
  });
});
