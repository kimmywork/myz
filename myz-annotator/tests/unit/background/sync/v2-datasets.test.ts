import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAllHighlights: vi.fn(),
  saveHighlight: vi.fn(),
  deleteHighlight: vi.fn(),
}));

vi.mock("@/background/storage", () => ({
  getAllHighlights: (...args: unknown[]) => mocks.getAllHighlights(...args),
  saveHighlight: (...args: unknown[]) => mocks.saveHighlight(...args),
  deleteHighlight: (...args: unknown[]) => mocks.deleteHighlight(...args),
}));

import { createHighlightDataset } from "@/background/sync/v2/datasets";

describe("v2 highlight dataset adapter", () => {
  beforeEach(() => {
    mocks.getAllHighlights.mockReset();
    mocks.saveHighlight.mockReset();
    mocks.deleteHighlight.mockReset();
  });

  it("collects highlights as h: records", async () => {
    mocks.getAllHighlights.mockResolvedValue([
      { id: "abc", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "" },
    ]);
    const dataset = createHighlightDataset();
    expect(dataset.streamId).toBe("highlights");
    const records = await dataset.collect();
    expect(records).toEqual([
      {
        recordId: "h:abc",
        updatedAt: "2026-01-01T00:00:00.000Z",
        data: {
          id: "abc",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "",
        },
      },
    ]);
  });

  it("applies remote records with the remote updatedAt", async () => {
    const dataset = createHighlightDataset();
    await dataset.apply({
      recordId: "h:abc",
      updatedAt: "2026-02-01T00:00:00.000Z",
      recordHash: "hash",
      data: { id: "abc", createdAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(mocks.saveHighlight).toHaveBeenCalledWith({
      id: "abc",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
  });

  it("removes a highlight by record id", async () => {
    const dataset = createHighlightDataset();
    await dataset.remove("h:abc");
    expect(mocks.deleteHighlight).toHaveBeenCalledWith("abc");
    await dataset.remove("unknown:x");
    expect(mocks.deleteHighlight).toHaveBeenCalledTimes(1);
  });
});
