import { describe, expect, it, vi } from "vitest";
import { InsightsAgent } from "@/background/ai/agents/insightsAgent.ts";

describe("InsightsAgent", () => {
  it("returns markdown when [[END]] marker present", async () => {
    const client = {
      createCompletion: vi.fn(async () => ({
        choices: [{ message: { content: "Summary [[END]]" } }],
      })),
    } as any;

    const agent = new InsightsAgent({ client });
    const result = await agent.generatePageInsightsWithConfig(
      {
        title: "Page",
        url: "http://example.com",
        chunks: [{ id: "c1", text: "content", prefix: "正文" }],
      },
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

    expect(result.markdown).toBe("Summary [[");
  });
});
