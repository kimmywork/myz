import { describe, expect, it, vi } from "vitest";
import { SkillSelectionAgent } from "@/background/ai/agents/skillSelectionAgent.ts";
import { ToolSelectionAgent } from "@/background/ai/agents/toolSelectionAgent.ts";

describe("SkillSelectionAgent", () => {
  it("filters selected skills", async () => {
    const client = {
      createCompletion: vi.fn(async () => ({
        choices: [{ message: { content: "{\"skill_names\":[\"s1\",\"s2\"]}" } }],
      })),
    } as any;

    const agent = new SkillSelectionAgent();
    const result = await agent.selectSkillNames({
      prompt: "use",
      skills: [{ name: "s1" }, { name: "s3" }],
      client,
      model: {
        model: "gpt-4",
        limits: { maxOutputTokens: 100, maxOutputTokenParam: "max_tokens" },
        capabilities: { reasoning: false },
      } as any,
    });
    expect(result).toEqual(["s1"]);
  });
});

describe("ToolSelectionAgent", () => {
  it("filters selected tools", async () => {
    const client = {
      createCompletion: vi.fn(async () => ({
        choices: [{ message: { content: "{\"tool_names\":[\"WebSearch\",\"Foo\"]}" } }],
      })),
    } as any;

    const agent = new ToolSelectionAgent();
    const result = await agent.selectToolNames({
      prompt: "find",
      tools: [{ name: "WebSearch" }, { name: "WebFetch" }],
      client,
      model: {
        model: "gpt-4",
        limits: { maxOutputTokens: 100, maxOutputTokenParam: "max_tokens" },
        capabilities: { reasoning: false },
      } as any,
    });
    expect(result).toEqual(["WebSearch"]);
  });
});
