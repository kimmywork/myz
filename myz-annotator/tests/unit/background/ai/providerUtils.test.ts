import { describe, expect, it } from "vitest";
import { normalizeBaseUrl, parseDataUrl, coerceContentToText, safeJsonParse } from "@/background/ai/providers/utils.ts";

describe("provider utils", () => {
  it("normalizes base url", () => {
    expect(normalizeBaseUrl("http://a/b/")) .toBe("http://a/b");
  });

  it("parses data url", () => {
    const result = parseDataUrl("data:image/png;base64,abcd");
    expect(result?.mimeType).toBe("image/png");
  });

  it("coerces content to text", () => {
    const text = coerceContentToText([
      { type: "text", text: "hello" },
      { type: "image_url", image_url: { url: "http://img" } },
    ] as any);
    expect(text).toContain("hello");
    expect(text).toContain("[Image]");
  });

  it("safely parses json", () => {
    expect(safeJsonParse("{\"a\":1}").a).toBe(1);
    expect(safeJsonParse("invalid")).toBeNull();
  });
});
