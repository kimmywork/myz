import { describe, expect, it, vi } from "vitest";
import { AutoHighlightAgent } from "@/background/ai/agents/autoHighlightAgent.ts";

describe("AutoHighlightAgent", () => {
  it("normalizes highlight output", async () => {
    const client = {
      createCompletion: vi.fn(async () => ({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content:
                "{\"highlights\":[{\"start\":0,\"end\":0,\"text\":\"Hello world.\",\"tags\":[\"#tag\"],\"category\":\"conceptual\"}]}" ,
            },
          },
        ],
      })),
    } as any;

    const agent = new AutoHighlightAgent({ client });
    const result = await agent.generateAutoHighlightsWithConfig(
      { text: "Hello world. Another line." },
      {
        isEnabled: true,
        callConfig: {
          provider: { id: "p1" } as any,
          model: {
            model: "gpt-4",
            limits: { maxOutputTokens: 200, maxOutputTokenParam: "max_tokens" },
            capabilities: { reasoning: false },
          } as any,
          temperature: 0.2,
        },
      },
    );

    expect(result.highlights[0].text).toBe("Hello world.");
    expect(result.highlights[0].tags).toEqual(["tag"]);
  });
});
