import { describe, expect, it } from "vitest";
import { splitContentAndReasoning, normalizeMessagePayload } from "@/background/ai/normalize/message.ts";

describe("normalize message", () => {
  it("splits text and reasoning parts", () => {
    const result = splitContentAndReasoning([
      { type: "text", text: "hello" },
      { type: "reasoning", text: "think" },
    ] as any);
    expect(result.text).toBe("hello");
    expect(result.reasoning).toBe("think");
  });

  it("handles gemini thought tags", () => {
    const payload = normalizeMessagePayload({
      content: "hi <thought>reason</thought>",
    });
    expect(payload.content).toBe("hi");
    expect(payload.reasoning).toBe("reason");
  });
});
