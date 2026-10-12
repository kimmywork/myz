import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isExtensionPage,
  findContentScriptTab,
  sendToContentScript,
} from "@/background/utils/sendToContentScript";

const mockTabsQuery = vi.fn();
const mockTabsGet = vi.fn();
const mockTabsSendMessage = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as any).chrome = {
    ...(globalThis as any).chrome,
    tabs: {
      query: mockTabsQuery,
      get: mockTabsGet,
      sendMessage: mockTabsSendMessage,
    },
    runtime: { lastError: undefined },
  };
});

describe("isExtensionPage", () => {
  it("returns true for chrome-extension:// URLs", () => {
    expect(
      isExtensionPage("chrome-extension://abc123/src/popup/popup.html"),
    ).toBe(true);
  });

  it("returns true for chrome:// URLs", () => {
    expect(isExtensionPage("chrome://settings")).toBe(true);
  });

  it("returns true for about:blank", () => {
    expect(isExtensionPage("about:blank")).toBe(true);
  });

  it("returns true for edge:// URLs", () => {
    expect(isExtensionPage("edge://flags")).toBe(true);
  });

  it("returns true for brave:// URLs", () => {
    expect(isExtensionPage("brave://rewards")).toBe(true);
  });

  it("returns false for http URLs", () => {
    expect(isExtensionPage("http://example.com")).toBe(false);
  });

  it("returns false for https URLs", () => {
    expect(isExtensionPage("https://example.com/page")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isExtensionPage(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isExtensionPage("")).toBe(false);
  });
});

describe("findContentScriptTab", () => {
  it("returns active tab if it is a regular page", async () => {
    mockTabsQuery.mockResolvedValueOnce([
      { id: 10, url: "https://example.com", active: true },
    ]);

    const tabId = await findContentScriptTab();
    expect(tabId).toBe(10);
  });

  it("skips active tab if it is an extension page and finds a regular tab", async () => {
    mockTabsQuery
      // first call: active tab query
      .mockResolvedValueOnce([
        { id: 1, url: "chrome-extension://abc/popup.html", active: true },
      ])
      // second call: all tabs query
      .mockResolvedValueOnce([
        { id: 1, url: "chrome-extension://abc/popup.html", active: true },
        { id: 2, url: "https://example.com", active: false },
        { id: 3, url: "chrome://settings", active: false },
      ]);

    const tabId = await findContentScriptTab();
    expect(tabId).toBe(2);
  });

  it("returns undefined when no regular web page tab exists", async () => {
    mockTabsQuery
      .mockResolvedValueOnce([
        { id: 1, url: "chrome-extension://abc/popup.html", active: true },
      ])
      .mockResolvedValueOnce([
        { id: 1, url: "chrome-extension://abc/popup.html", active: true },
        { id: 3, url: "chrome://settings", active: false },
      ]);

    const tabId = await findContentScriptTab();
    expect(tabId).toBeUndefined();
  });
});

describe("sendToContentScript", () => {
  it("uses provided tabId if it is a regular page", async () => {
    mockTabsGet.mockResolvedValue({ id: 5, url: "https://example.com" });
    mockTabsSendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb: (resp: unknown) => void) => {
        cb({ ok: true, data: { markdown: "hello" } });
      },
    );

    const result = await sendToContentScript<
      { html: string },
      { markdown: string }
    >("myz:convertHtmlToMarkdown", { html: "<p>hello</p>" }, 5);

    expect(mockTabsGet).toHaveBeenCalledWith(5);
    expect(mockTabsSendMessage).toHaveBeenCalledWith(
      5,
      { type: "myz:convertHtmlToMarkdown", payload: { html: "<p>hello</p>" } },
      expect.any(Function),
    );
    expect(result).toEqual({ markdown: "hello" });
  });

  it("skips provided tabId if it is an extension page and finds another tab", async () => {
    // tabId 1 is an extension page
    mockTabsGet.mockResolvedValue({
      id: 1,
      url: "chrome-extension://abc/dashboard.html",
    });
    // findContentScriptTab finds tab 2
    mockTabsQuery.mockResolvedValueOnce([
      { id: 2, url: "https://example.com", active: true },
    ]);
    mockTabsSendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb: (resp: unknown) => void) => {
        cb({ ok: true, data: { markdown: "converted" } });
      },
    );

    const result = await sendToContentScript<
      { html: string },
      { markdown: string }
    >("myz:convertHtmlToMarkdown", { html: "<p>test</p>" }, 1);

    expect(mockTabsSendMessage).toHaveBeenCalledWith(
      2,
      expect.any(Object),
      expect.any(Function),
    );
    expect(result).toEqual({ markdown: "converted" });
  });

  it("throws when no content script tab is available", async () => {
    mockTabsGet.mockResolvedValue({
      id: 1,
      url: "chrome-extension://abc/popup.html",
    });
    // no regular tabs
    mockTabsQuery
      .mockResolvedValueOnce([
        { id: 1, url: "chrome-extension://abc/popup.html", active: true },
      ])
      .mockResolvedValueOnce([
        { id: 1, url: "chrome-extension://abc/popup.html", active: true },
      ]);

    await expect(
      sendToContentScript("myz:convertHtmlToMarkdown", { html: "<p>x</p>" }, 1),
    ).rejects.toThrow("No active tab found to send message");
  });

  it("propagates content script error response", async () => {
    mockTabsGet.mockResolvedValue({ id: 5, url: "https://example.com" });
    mockTabsSendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb: (resp: unknown) => void) => {
        cb({ ok: false, error: "parse failure" });
      },
    );

    await expect(
      sendToContentScript("myz:convertHtmlToMarkdown", { html: "<p>x</p>" }, 5),
    ).rejects.toThrow("parse failure");
  });
});
