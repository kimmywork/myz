// @vitest-environment node
import type { MyZRecord } from "@myz/shared/types";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@/messaging/invoke", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { useDeleteStore } from "@/dashboard/stores/delete";

const record = { id: "r1", text: "delete me" } as MyZRecord;

function mockBackend(options: { committed: boolean; cancelled: boolean }) {
  invokeMock.mockImplementation(async (type: string) => {
    if (type === "myz:queuePendingDelete") return { ok: true };
    if (type === "myz:commitPendingDelete") {
      return { committed: options.committed };
    }
    if (type === "myz:cancelPendingDelete") {
      return { ok: options.cancelled };
    }
    return {};
  });
}

function calledTypes() {
  return invokeMock.mock.calls.map((call) => call[0] as string);
}

describe("delete store removeNow", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invokeMock.mockReset();
  });

  it("cancels the intent before restoring when the immediate commit fails", async () => {
    mockBackend({ committed: false, cancelled: true });
    const store = useDeleteStore();

    await store.removeNow([record]);

    const types = calledTypes();
    expect(types.indexOf("myz:cancelPendingDelete")).toBeGreaterThan(
      types.indexOf("myz:commitPendingDelete"),
    );
    expect(store.message).toBe("删除失败，记录已恢复");
    expect(store.isPending("r1")).toBe(false);
  });

  it("keeps the intent and does not claim a restore when cancel fails", async () => {
    mockBackend({ committed: false, cancelled: false });
    const store = useDeleteStore();

    await store.removeNow([record]);

    expect(store.message).toBe("删除失败，稍后会重试");
    expect(store.isPending("r1")).toBe(true);
  });

  it("clears a stale failure message after a successful retry", async () => {
    mockBackend({ committed: false, cancelled: true });
    const store = useDeleteStore();
    await store.removeNow([record]);
    expect(store.message).toBe("删除失败，记录已恢复");

    mockBackend({ committed: true, cancelled: true });
    await store.removeNow([record]);
    expect(store.message).toBe("");
    expect(store.isPending("r1")).toBe(false);
  });

  it("clears the pending row after a successful commit", async () => {
    mockBackend({ committed: true, cancelled: true });
    const store = useDeleteStore();

    await store.removeNow([record]);

    expect(store.message).toBe("");
    expect(store.isPending("r1")).toBe(false);
  });
});
