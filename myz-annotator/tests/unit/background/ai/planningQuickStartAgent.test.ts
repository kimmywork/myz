import { describe, expect, it, vi } from "vitest";
import { PlanningAgent } from "@/background/ai/agents/planningAgent.ts";
import { QuickStartAgent } from "@/background/ai/agents/quickStartAgent.ts";

describe("PlanningAgent", () => {
  it("parses plan JSON", async () => {
    const client = {
      createCompletion: vi.fn(async () => ({
        choices: [{ message: { content: "{\"type\":\"plan\",\"tasks\":[{\"title\":\"t\",\"deliverables\":[{\"description\":\"d\"}]}]}" } }],
      })),
    } as any;

    const agent = new PlanningAgent();
    const result = await agent.createPlan({
      prompt: "do",
      client,
      model: { model: "gpt-4", limits: { maxOutputTokens: 200 } } as any,
    });
    expect(result.tasks[0].title).toBe("t");
  });

  it("falls back on clarify response", async () => {
    const client = {
      createCompletion: vi.fn(async () => ({
        choices: [{ message: { content: "{\"type\":\"clarify\",\"questions\":[\"need\"]}" } }],
      })),
    } as any;

    const agent = new PlanningAgent();
    const result = await agent.createPlan({
      prompt: "do",
      client,
      model: { model: "gpt-4", limits: { maxOutputTokens: 200 } } as any,
    });
    expect(result.tasks[0].title).toContain("补齐");
  });
});

describe("QuickStartAgent", () => {
  it("returns fallback when empty", async () => {
    const client = {
      createCompletion: vi.fn(async () => ({
        choices: [{ message: { content: "{}" } }],
      })),
    } as any;

    const agent = new QuickStartAgent();
    const result = await agent.createPlan({
      prompt: "do",
      client,
      model: { model: "gpt-4", limits: { maxOutputTokens: 200 } } as any,
    });
    expect(result.tasks.length).toBeGreaterThan(0);
  });
});
