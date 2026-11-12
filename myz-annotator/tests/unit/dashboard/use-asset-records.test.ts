// @vitest-environment node
import type { StagedAssetMeta } from "@myz/core/staged-asset";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@/messaging/invoke.js", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { useAssetRecords } from "@/dashboard/pages/assets/use-asset-records";

function asset(id: string): StagedAssetMeta {
  return {
    id,
    name: `asset ${id}`,
    mime: "image/png",
    width: 8,
    height: 6,
    thumb: "data:image/png;base64,xxx",
    sourceKind: "image",
    createdAt: "2026-01-01T00:00:00.000Z",
    size: 16,
  } as StagedAssetMeta;
}

function setup() {
  const cleared: string[][] = [];
  const saved: number[] = [];
  const partial: Array<[number, number]> = [];
  const records = useAssetRecords({
    onSaved: (count) => saved.push(count),
    onPartial: (done, failed) => partial.push([done, failed]),
    clearSelection: (ids) => cleared.push([...ids]),
  });
  return { records, cleared, saved, partial };
}

describe("useAssetRecords", () => {
  beforeEach(() => invokeMock.mockClear());

  it("saves each capture and clears only the saved ones", async () => {
    invokeMock.mockResolvedValue({});
    const { records, cleared, saved } = setup();

    const count = await records.save([asset("a"), asset("b")]);

    expect(count).toBe(2);
    expect(saved).toEqual([2]);
    expect(cleared).toEqual([["a", "b"]]);
  });

  it("keeps a failed capture selected so it can be retried", async () => {
    invokeMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("save failed"))
      .mockResolvedValueOnce({});
    const { records, cleared, partial } = setup();

    await records.save([asset("a"), asset("b"), asset("c")]);

    expect(partial).toEqual([[2, 1]]);
    // b failed: it stays selected, a and c (now records) do not.
    expect(cleared).toEqual([["a", "c"]]);
  });

  it("ignores a second submit while the first is still running", async () => {
    invokeMock.mockResolvedValue({});
    const { records } = setup();

    // Both calls start in the same tick; only the first does any work.
    const first = records.save([asset("a")]);
    expect(records.saving.value).toBe(true);
    const second = records.save([asset("b")]);

    expect(await second).toBe(0);
    expect(await first).toBe(1);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(records.saving.value).toBe(false);
  });
});
