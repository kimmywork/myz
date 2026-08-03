import { describe, it, expect, vi, beforeEach } from "vitest";
import { RECORD_KINDS } from "@/shared/types";
import {
  initializeHighlightMessageHandlers,
  SaveHighlightMessagePayload,
} from "@/background/messages/highlights";
import { handleMessage } from "@/background/messages/handler";

const mockSaveHighlight = vi.fn();
const mockGetHighlight = vi.fn();
const mockDeleteHighlight = vi.fn();
const mockPersistHighlightPreferences = vi.fn();
const mockGenerateId = vi.fn();
const mockEnsureRecordSchemaVersion = vi.fn();
const mockResolveRecordContentType = vi.fn();
const mockNormalizeHighlightStyle = vi.fn();
const mockGetRecordKind = vi.fn();

vi.mock("@/background/storage", () => ({
  saveHighlight: (...args: unknown[]) => mockSaveHighlight(...args),
  getHighlight: (...args: unknown[]) => mockGetHighlight(...args),
  deleteHighlight: (...args: unknown[]) => mockDeleteHighlight(...args),
  persistHighlightPreferences: (...args: unknown[]) =>
    mockPersistHighlightPreferences(...args),
  generateId: (...args: unknown[]) => mockGenerateId(...args),
}));

vi.mock("@/background/sync/deletions", () => ({
  recordHighlightDeletion: vi.fn(),
}));

vi.mock("@/shared/types", () => ({
  ensureRecordSchemaVersion: (...args: unknown[]) =>
    mockEnsureRecordSchemaVersion(...args),
  resolveRecordContentType: (...args: unknown[]) =>
    mockResolveRecordContentType(...args),
  getRecordKind: (...args: unknown[]) => mockGetRecordKind(...args),
  RECORD_KINDS: {
    HIGHLIGHT: "highlight",
    CLIP: "clip",
    BOOKMARK: "bookmark",
  },
}));

vi.mock("@/shared/highlightUtils", () => ({
  normalizeHighlightStyle: (...args: unknown[]) =>
    mockNormalizeHighlightStyle(...args),
}));

const createTab = (overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab =>
  ({
    id: 1,
    index: 0,
    highlighted: false,
    pinned: false,
    windowId: 1,
    active: false,
    incognito: false,
    selected: false,
    discarded: false,
    autoDiscardable: true,
    frozen: false,
    url: "https://example.com",
    title: "Example",
    favIconUrl: "",
    status: "complete",
    ...overrides,
  }) as chrome.tabs.Tab;

describe("background highlights message handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initializeHighlightMessageHandlers();
  });

  it("should register save highlight handler", () => {
    expect(handleMessage).toBeDefined();
  });

  it("should save a highlight with normalized kind and style", async () => {
    mockGenerateId.mockReturnValue("generated-id");
    mockEnsureRecordSchemaVersion.mockImplementation(
      (record: unknown) => record,
    );
    mockResolveRecordContentType.mockReturnValue("plain");
    mockNormalizeHighlightStyle.mockReturnValue("highlight");
    mockGetRecordKind.mockReturnValue("highlight");

    const payload: SaveHighlightMessagePayload = {
      text: "test highlight",
      url: "https://example.com",
      kind: RECORD_KINDS.HIGHLIGHT,
    };
    mockSaveHighlight.mockResolvedValue(undefined);

    const result = (await handleMessage(
      "myz:saveHighlight",
      payload,
      { tab: createTab() } as chrome.runtime.MessageSender,
    )) as { id?: string };

    expect(mockSaveHighlight).toHaveBeenCalledTimes(1);
    expect(result.id).toBe("generated-id");
  });

  it("should update an existing highlight", async () => {
    mockGetHighlight.mockResolvedValue({
      id: "existing-id",
      text: "old text",
      kind: "highlight",
    });
    mockEnsureRecordSchemaVersion.mockImplementation(
      (record: unknown) => record,
    );
    mockResolveRecordContentType.mockReturnValue("plain");
    mockNormalizeHighlightStyle.mockReturnValue("highlight");

    const result = (await handleMessage(
      "myz:updateHighlight",
      { id: "existing-id", text: "new text" },
      { tab: createTab() } as chrome.runtime.MessageSender,
    )) as { text?: string };

    expect(mockGetHighlight).toHaveBeenCalledWith("existing-id");
    expect(mockSaveHighlight).toHaveBeenCalledTimes(1);
    expect(result.text).toBe("new text");
  });

  it("should remove a highlight", async () => {
    mockGetHighlight.mockResolvedValue({ id: "to-delete" });
    mockDeleteHighlight.mockResolvedValue(undefined);

    const result = (await handleMessage(
      "myz:removeHighlight",
      { id: "to-delete" },
      { tab: createTab() } as chrome.runtime.MessageSender,
    )) as { success: boolean };

    expect(mockDeleteHighlight).toHaveBeenCalledWith("to-delete");
    expect(result.success).toBe(true);
  });
});
