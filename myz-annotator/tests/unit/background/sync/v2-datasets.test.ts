import { RECORD_SCHEMA_VERSION } from "@myz/shared/versioning";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAllHighlights: vi.fn(),
  saveHighlight: vi.fn(),
  deleteHighlight: vi.fn(),
  listOpaqueRecords: vi.fn(),
  putOpaqueRecord: vi.fn(),
  deleteOpaqueRecord: vi.fn(),
}));

vi.mock("@/background/storage", () => ({
  getAllHighlights: (...args: unknown[]) => mocks.getAllHighlights(...args),
  saveHighlight: (...args: unknown[]) => mocks.saveHighlight(...args),
  deleteHighlight: (...args: unknown[]) => mocks.deleteHighlight(...args),
  listOpaqueRecords: (...args: unknown[]) => mocks.listOpaqueRecords(...args),
  putOpaqueRecord: (...args: unknown[]) => mocks.putOpaqueRecord(...args),
  deleteOpaqueRecord: (...args: unknown[]) => mocks.deleteOpaqueRecord(...args),
}));

import { createHighlightDataset } from "@/background/sync/v2/datasets";

describe("v2 highlight dataset adapter", () => {
  beforeEach(() => {
    mocks.getAllHighlights.mockReset();
    mocks.saveHighlight.mockReset();
    mocks.deleteHighlight.mockReset();
    mocks.listOpaqueRecords.mockReset().mockResolvedValue([]);
    mocks.putOpaqueRecord.mockReset();
    mocks.deleteOpaqueRecord.mockReset();
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
      data: {
        schemaVersion: RECORD_SCHEMA_VERSION,
        schemaId: "myz.record",
        id: "abc",
        kind: "highlight",
        text: "t",
        url: "u",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(mocks.saveHighlight).toHaveBeenCalledWith({
      schemaVersion: RECORD_SCHEMA_VERSION,
      schemaId: "myz.record",
      id: "abc",
      kind: "highlight",
      text: "t",
      url: "u",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
  });

  it("propagates storage failures instead of falling back to opaque", async () => {
    mocks.saveHighlight.mockRejectedValue(new Error("idb boom"));
    const dataset = createHighlightDataset();
    await expect(
      dataset.apply({
        recordId: "h:abc",
        updatedAt: "2026-02-01T00:00:00.000Z",
        recordHash: "hash",
        data: {
          schemaVersion: RECORD_SCHEMA_VERSION,
          schemaId: "myz.record",
          id: "abc",
          kind: "highlight",
          text: "t",
          url: "u",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow("idb boom");
    expect(mocks.putOpaqueRecord).not.toHaveBeenCalled();
  });

  it("preserves unknown records opaquely and removes them", async () => {
    const dataset = createHighlightDataset();
    await dataset.apply({
      recordId: "n:future",
      updatedAt: "2026-02-01T00:00:00.000Z",
      recordHash: "hash",
      data: { schemaId: "future.kind" },
    });
    expect(mocks.putOpaqueRecord).toHaveBeenCalledWith({
      streamId: "highlights",
      recordId: "n:future",
      updatedAt: "2026-02-01T00:00:00.000Z",
      data: { schemaId: "future.kind" },
    });
    expect(mocks.saveHighlight).not.toHaveBeenCalled();

    await dataset.remove("h:abc");
    expect(mocks.deleteHighlight).toHaveBeenCalledWith("abc");
    await dataset.remove("unknown:x");
    expect(mocks.deleteHighlight).toHaveBeenCalledTimes(1);
    expect(mocks.deleteOpaqueRecord).toHaveBeenCalledWith(
      "highlights",
      "unknown:x",
    );
  });
});
