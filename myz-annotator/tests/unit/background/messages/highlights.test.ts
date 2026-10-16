import { RECORD_KINDS, CONTENT_TYPES } from "@myz/shared/types";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMessage } from "@/background/messages/handler";
import {
  initializeHighlightMessageHandlers,
  SaveHighlightMessagePayload,
} from "@/background/messages/highlights";

const mockSaveHighlight = vi.fn();
const mockGetHighlight = vi.fn();
const mockDeleteHighlight = vi.fn();
const mockPersistHighlightPreferences = vi.fn();
const mockGenerateId = vi.fn();
const mockEnsureRecordSchemaVersion = vi.fn();
const mockResolveRecordContentType = vi.fn();
const mockNormalizeHighlightStyle = vi.fn();
const mockGetRecordKind = vi.fn();
const mockSendToContentScript = vi.fn();

vi.mock("@/background/storage", () => ({
  saveHighlight: (...args: unknown[]) => mockSaveHighlight(...args),
  getHighlight: (...args: unknown[]) => mockGetHighlight(...args),
  deleteHighlight: (...args: unknown[]) => mockDeleteHighlight(...args),
  persistHighlightPreferences: (...args: unknown[]) =>
    mockPersistHighlightPreferences(...args),
  generateId: (...args: unknown[]) => mockGenerateId(...args),
  readSettings: async () => ({ inboxEnabled: false }),
}));

vi.mock("@/background/sync/deletions", () => ({
  recordHighlightDeletion: vi.fn(),
}));

vi.mock("@myz/shared/types", () => ({
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
  CONTENT_TYPES: {
    MARKDOWN: "markdown",
    PLAIN: "plain",
    HTML: "html",
  },
}));

vi.mock("@myz/shared/highlightUtils", () => ({
  normalizeHighlightStyle: (...args: unknown[]) =>
    mockNormalizeHighlightStyle(...args),
}));

vi.mock("@/background/utils/sendToContentScript", () => ({
  sendToContentScript: (...args: unknown[]) => mockSendToContentScript(...args),
}));

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

    const result = (await handleMessage("myz:saveHighlight", payload, {
      tabId: 1,
      trusted: false,
    })) as { id?: string };

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
      { tabId: 1, trusted: false },
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
      { tabId: 1, trusted: false },
    )) as { success: boolean };

    expect(mockDeleteHighlight).toHaveBeenCalledWith("to-delete");
    expect(result.success).toBe(true);
  });

  it("should use content script markdown conversion when available", async () => {
    mockGenerateId.mockReturnValue("html-id");
    mockEnsureRecordSchemaVersion.mockImplementation(
      (record: unknown) => record,
    );
    mockResolveRecordContentType.mockReturnValue("plain");
    mockGetRecordKind.mockReturnValue("clip");
    mockSaveHighlight.mockResolvedValue(undefined);
    mockSendToContentScript.mockResolvedValue({ markdown: "converted text" });

    const payload: SaveHighlightMessagePayload = {
      html: "<p>converted text</p>",
      url: "https://example.com",
      kind: RECORD_KINDS.CLIP,
    };

    const result = (await handleMessage("myz:saveHighlight", payload, {
      tabId: 1,
      trusted: false,
    })) as { text?: string; html?: string };

    expect(mockSendToContentScript).toHaveBeenCalledWith(
      "myz:convertHtmlToMarkdown",
      { html: "<p>converted text</p>" },
      1,
    );
    expect(result.text).toBe("converted text");
    expect(result.html).toBeUndefined();
  });

  it("should fall back to HTML tag stripping when content script is unavailable", async () => {
    mockGenerateId.mockReturnValue("fallback-id");
    mockEnsureRecordSchemaVersion.mockImplementation(
      (record: unknown) => record,
    );
    mockResolveRecordContentType.mockReturnValue("plain");
    mockGetRecordKind.mockReturnValue("clip");
    mockSaveHighlight.mockResolvedValue(undefined);
    // Content script not available
    mockSendToContentScript.mockRejectedValue(
      new Error("No active tab found to send message"),
    );

    const payload: SaveHighlightMessagePayload = {
      html: "<p><strong>bold</strong> and <em>italic</em></p>",
      url: "https://example.com",
      kind: RECORD_KINDS.CLIP,
    };

    const result = (await handleMessage("myz:saveHighlight", payload, {
      tabId: 1,
      trusted: false,
    })) as {
      text?: string;
      html?: string;
      contentType?: string;
    };

    // HTML tags should be stripped, leaving text content
    expect(result.text).toContain("bold");
    expect(result.text).toContain("italic");
    expect(result.text).not.toContain("<");
    expect(result.contentType).toBe(CONTENT_TYPES.MARKDOWN);
    // html field should be removed
    expect(result.html).toBeUndefined();
  });

  it("should not set contentType to MARKDOWN when fallback text is empty", async () => {
    mockGenerateId.mockReturnValue("empty-id");
    mockEnsureRecordSchemaVersion.mockImplementation(
      (record: unknown) => record,
    );
    mockResolveRecordContentType.mockReturnValue("plain");
    mockGetRecordKind.mockReturnValue("clip");
    mockSaveHighlight.mockResolvedValue(undefined);
    mockSendToContentScript.mockRejectedValue(new Error("no tab"));

    const payload: SaveHighlightMessagePayload = {
      html: "<img src='x.png'>",
      url: "https://example.com",
      kind: RECORD_KINDS.CLIP,
    };

    const result = (await handleMessage("myz:saveHighlight", payload, {
      tabId: 1,
      trusted: false,
    })) as {
      text?: string;
      contentType?: string;
    };

    // text should be set to empty string (not left undefined)
    expect(result.text).toBe("");
    // contentType should NOT be set to MARKDOWN since there's no text content
    expect(result.contentType).not.toBe(CONTENT_TYPES.MARKDOWN);
  });
});
