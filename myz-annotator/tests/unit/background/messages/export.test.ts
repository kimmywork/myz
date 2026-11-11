import { beforeEach, describe, expect, it, vi } from "vitest";

const records = [
  { id: "a", text: "A", createdAt: "2026-11-01T00:00:00.000Z", tags: [] },
  { id: "b", text: "B", createdAt: "2026-11-02T00:00:00.000Z", tags: [] },
];

vi.mock("@/background/stores", () => ({ recordsStore: {} }));

vi.mock("@myz/core/services/records", () => ({
  listRecords: async () => records,
  normalizeIds: (ids?: readonly string[]) =>
    Array.isArray(ids)
      ? Array.from(new Set(ids.filter((id) => Boolean(id)) as string[]))
      : [],
  createRecord: vi.fn(),
  getRecordsForUrls: vi.fn(),
  removeRecord: vi.fn(),
  removeRecords: vi.fn(),
  resolveRequestedUrls: vi.fn(),
  updateRecord: vi.fn(),
  updateRecordRange: vi.fn(),
  updateRecordsPatch: vi.fn(),
}));

vi.mock("@/background/delete-journal-runtime", () => ({
  withoutPendingDeletes: async <T>(items: T[]): Promise<T[]> => items,
}));

vi.mock("@/background/storage", () => ({
  generateId: vi.fn(),
  persistHighlightPreferences: vi.fn(),
  readSettings: async () => ({ inboxEnabled: false }),
}));

vi.mock("@/background/sync/deletions", () => ({
  recordHighlightDeletion: vi.fn(),
  clearHighlightDeletion: vi.fn(),
}));

vi.mock("@/background/inbox/actions", () => ({
  getInboxStatus: vi.fn(),
  setInboxStatus: vi.fn(),
}));

vi.mock("@/background/badge", () => ({
  normalizeBadgeCounts: vi.fn(),
  buildActionTitle: vi.fn(),
}));

vi.mock("@/background/utils/sendToContentScript", () => ({
  sendToContentScript: vi.fn(),
}));

vi.mock("@/messaging/changes", () => ({
  changeBus: { publish: vi.fn(), subscribe: vi.fn() },
}));

vi.mock("@myz/core/markdown-export", () => ({
  buildMarkdownExport: (items: Array<{ text?: string }>) =>
    items.map((item) => item.text ?? "").join("\n"),
}));

import { handleMessage } from "@/background/messages/handler";
import { initializeHighlightMessageHandlers } from "@/background/messages/highlights";

const ctx = { tabId: 1, trusted: false };

describe("myz:export contract", () => {
  beforeEach(() => {
    initializeHighlightMessageHandlers();
  });

  it("exports every record when ids are omitted", async () => {
    const result = (await handleMessage("myz:export", {}, ctx)) as {
      json: string;
      markdown: string;
    };
    expect(JSON.parse(result.json)).toHaveLength(2);
  });

  it("exports only the requested ids", async () => {
    const result = (await handleMessage("myz:export", { ids: ["b"] }, ctx)) as {
      json: string;
      markdown: string;
    };
    expect(
      JSON.parse(result.json).map((record: { id: string }) => record.id),
    ).toEqual(["b"]);
    expect(result.markdown).toBe("B");
  });

  it("returns an empty export for unknown ids", async () => {
    const result = (await handleMessage(
      "myz:export",
      { ids: ["missing"] },
      ctx,
    )) as { json: string; markdown: string };
    expect(JSON.parse(result.json)).toEqual([]);
  });
});
