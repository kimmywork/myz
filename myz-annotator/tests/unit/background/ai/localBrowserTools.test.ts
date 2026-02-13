import { beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeChrome } from "./testUtils.ts";

const { LOCAL_TOOL_HANDLERS } = await import("@/background/ai/tools/local.ts");

describe("local browser tools", () => {
  let chromeMock: any;

  beforeEach(() => {
    chromeMock = installFakeChrome({
      tabs: {
        create: vi.fn(async ({ url, active }: any) => ({
          id: 1,
          url,
          active,
          title: "Tab",
          windowId: 1,
        })),
        get: vi.fn(async () => ({
          id: 1,
          url: "https://www.google.com/search?q=test",
          status: "complete",
          windowId: 1,
        })),
        remove: vi.fn(async () => undefined),
        sendMessage: vi.fn(async (_tabId: number, message: any) => {
          if (message.type === "myz:extractSearchResults") {
            return { data: { results: [{ title: "A", url: "https://a", snippet: "x" }] } };
          }
          if (message.type === "myz:extractPrimaryContent") {
            return {
              data: {
                title: "Title",
                url: "https://example.com",
                text: "Body",
                wordCount: 1,
                chunkCount: 1,
              },
            };
          }
          if (message.type === "myz:runDomActions") {
            return { data: { results: [{ ok: true }] } };
          }
          if (message.type === "myz:extractPageContent") {
            return { data: { text: "Page content" } };
          }
          return {};
        }),
        update: vi.fn(async (tabId: number, update: any) => ({
          id: tabId,
          url: update.url || "https://example.com",
          title: "Tab",
          windowId: 1,
        })),
        query: vi.fn(async () => [
          { id: 1, title: "Tab", url: "https://example.com", active: true, windowId: 1 },
        ]),
        captureVisibleTab: vi.fn(async () => "data:image/jpeg;base64,abc"),
      },
      windows: {
        update: vi.fn(async () => undefined),
      },
      scripting: {
        executeScript: vi.fn(async () => [{ result: { ok: true } }]),
      },
    } as any);
  });

  it("web search returns results", async () => {
    const result = await LOCAL_TOOL_HANDLERS.WebSearch({ query: "test", engine: "google" });
    expect(result.data?.length).toBe(1);
    expect(chromeMock.tabs.remove).toHaveBeenCalled();
  });

  it("web fetch returns content", async () => {
    chromeMock.tabs.get.mockResolvedValueOnce({
      id: 1,
      url: "https://example.com",
      status: "complete",
      windowId: 1,
    });
    const result = await LOCAL_TOOL_HANDLERS.WebFetch({ url: "https://example.com" });
    expect(result.data?.url).toBe("https://example.com");
    expect(chromeMock.tabs.remove).toHaveBeenCalled();
  });

  it("lists tabs", async () => {
    const result = await LOCAL_TOOL_HANDLERS.ListTabs({ currentWindow: true });
    expect(result.data?.length).toBe(1);
  });

  it("activates tab", async () => {
    const result = await LOCAL_TOOL_HANDLERS.ActivateTab({ tabId: 1 });
    expect(result.isError).not.toBe(true);
    expect(chromeMock.windows.update).toHaveBeenCalled();
  });

  it("opens new tab", async () => {
    const result = await LOCAL_TOOL_HANDLERS.NewTab({ url: "https://example.com" });
    expect(result.data?.url).toContain("https://example.com");
  });

  it("runs dom actions", async () => {
    const result = await LOCAL_TOOL_HANDLERS.RunDomActions({
      tabId: 1,
      actions: [{ type: "query", selector: "body" }],
    });
    expect(result.data?.results?.length).toBe(1);
  });

  it("gets page context", async () => {
    const result = await LOCAL_TOOL_HANDLERS.GetPageContext({ tabId: 1 });
    expect(result.data?.content).toBe("Page content");
  });

  it("evals in page", async () => {
    const result = await LOCAL_TOOL_HANDLERS.EvalInPage({ tabId: 1, code: "return 1" });
    expect(result.data?.results?.length).toBe(1);
  });
});
