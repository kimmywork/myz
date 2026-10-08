import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  deletions: [] as Array<{ recordId: string; deletedAt: string }>,
  removed: [] as string[],
}));

vi.mock("@/background/sync/storage", () => ({
  listDeletions: async () => holder.deletions,
  removeDeletion: async (recordId: string) => {
    holder.removed.push(recordId);
  },
}));

vi.mock("@/background/storage", () => ({
  getAllHighlights: async () => [],
  saveHighlight: async () => {},
  deleteHighlight: async () => {},
  getAllInboxStates: async () => [],
  putInboxState: async () => {},
  deleteInboxState: async () => {},
}));

import { createHighlightDataset } from "@/background/sync/v2/datasets";
import { createInboxDataset } from "@/background/sync/v2/inboxDataset";

describe("v2 dataset tombstone sources", () => {
  beforeEach(() => {
    holder.deletions = [
      { recordId: "h:1", deletedAt: "2026-01-01T00:00:00.000Z" },
      { recordId: "status:h:1", deletedAt: "2026-01-02T00:00:00.000Z" },
      { recordId: "mark:h:1", deletedAt: "2026-01-02T00:00:00.000Z" },
      { recordId: "rel:h:1:h:2", deletedAt: "2026-01-02T00:00:00.000Z" },
    ];
    holder.removed = [];
  });

  it("highlight stream publishes only h: tombstones", async () => {
    const tombstones = await createHighlightDataset().collectTombstones?.();
    expect(tombstones).toEqual({ "h:1": "2026-01-01T00:00:00.000Z" });
  });

  it("inbox stream publishes only status/mark/rel tombstones", async () => {
    const tombstones = await createInboxDataset().collectTombstones?.();
    expect(Object.keys(tombstones ?? {}).sort()).toEqual([
      "mark:h:1",
      "rel:h:1:h:2",
      "status:h:1",
    ]);
  });

  it("clearTombstones removes the pushed ids", async () => {
    await createHighlightDataset().clearTombstones?.(["h:1"]);
    expect(holder.removed).toEqual(["h:1"]);
  });
});
