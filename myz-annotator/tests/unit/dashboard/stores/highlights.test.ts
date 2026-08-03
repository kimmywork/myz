import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useHighlightsStore } from "@/dashboard/stores/highlights";
import { MyZRecord, RECORD_KINDS } from "@/shared/types";

const mockSendMessage = vi.fn();

vi.mock("@/shared/messaging", () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

const createRecord = (overrides: Partial<MyZRecord> = {}): MyZRecord => {
  const id = (overrides.id || overrides.recordId || "record-1") as string;
  const recordId = (overrides.recordId || "record-1") as string;
  const record: MyZRecord = {
    schemaVersion: "1.0.0",
    recordId,
    id,
    kind: overrides.kind || RECORD_KINDS.HIGHLIGHT,
    text: overrides.text || "sample text",
    url: overrides.url || "https://example.com/page",
    sourceUrl: overrides.sourceUrl || "",
    title: overrides.title || "Example",
    hostname: overrides.hostname || "example.com",
    createdAt: overrides.createdAt || new Date().toISOString(),
    updatedAt: overrides.updatedAt || new Date().toISOString(),
    tags: overrides.tags,
    note: overrides.note,
    ...overrides,
  };
  return record;
};

describe("dashboard highlights store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it("availableSites should derive unique sorted hostnames", async () => {
    const store = useHighlightsStore();
    mockSendMessage.mockResolvedValue([
      createRecord({ hostname: "b.example.com" }),
      createRecord({ hostname: "a.example.com" }),
      createRecord({ hostname: "a.example.com" }),
    ]);

    await store.initialize();
    expect(store.availableSites).toEqual(["a.example.com", "b.example.com"]);
  });

  it("availableTags should derive unique sorted tags", async () => {
    const store = useHighlightsStore();
    mockSendMessage.mockResolvedValue([
      createRecord({ tags: ["beta", "alpha"] }),
      createRecord({ tags: ["alpha", "gamma"] }),
    ]);

    await store.initialize();
    expect(store.availableTags).toEqual(["alpha", "beta", "gamma"]);
  });
});
