import { describe, expect, it } from "vitest";
import { splitGeminiThoughtTaggedContent, extractGeminiThoughtSegments } from "@/background/ai/vendors/googleGemini.ts";

describe("googleGemini helpers", () => {
  it("splits thought tags", () => {
    const content = "Hello <thought>thinking</thought> world";
    const result = splitGeminiThoughtTaggedContent(content);
    expect(result.text).toBe("Hello  world".trim());
    expect(result.thought).toBe("thinking");
  });

  it("extracts thought segments from buffer", () => {
    const buffer = "prefix <thought>idea</thought> tail";
    const result = extractGeminiThoughtSegments(buffer);
    expect(result.buffer).toContain("prefix  tail");
    expect(result.thought).toBe("idea");
  });
});
