import { describe, expect, it, vi } from "vitest";
import { PlanReviewAgent } from "@/background/ai/agents/planReviewAgent.ts";

const basePlan = {
  id: "plan-1",
  status: "reviewing",
  mode: "quick",
  originalUserRequest: "总结页面",
  tasks: [],
  currentTaskId: null,
  planReview: { status: "pending", issues: [], missingInfo: [] },
  validation: {
    status: "pending",
    expectationScore: 0,
    deliverableScore: 0,
    issues: [],
    missingDeliverables: [],
  },
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("PlanReviewAgent", () => {
  it("parses pass review result", async () => {
    const client = {
      createCompletion: vi.fn(async () => ({
        choices: [
          {
            message: {
              content:
                "好的，以下是结果。\n{\"status\":\"pass\",\"issues\":[],\"missingInfo\":[]}",
            },
          },
        ],
      })),
    };
    const agent = new PlanReviewAgent();
    const review = await agent.review({
      originalUserRequest: "总结页面",
      taskPlan: basePlan as any,
      client: client as any,
      model: { model: "test-model", limits: { maxOutputTokens: 200 } } as any,
    });

    expect(review.status).toBe("pass");
    expect(review.issues).toEqual([]);
    expect(review.missingInfo).toEqual([]);
  });

  it("normalizes issues and missing info", async () => {
    const client = {
      createCompletion: vi.fn(async () => ({
        choices: [
          {
            message: {
              content:
                "{\"status\":\"fail\",\"issues\":[\"  缺验收标准  \",\"\"],\"missingInfo\":[\"  目标  \",\" \" ]}",
            },
          },
        ],
      })),
    };
    const agent = new PlanReviewAgent();
    const review = await agent.review({
      originalUserRequest: "总结页面",
      taskPlan: basePlan as any,
      client: client as any,
      model: { model: "test-model", limits: { maxOutputTokens: 200 } } as any,
    });

    expect(review.status).toBe("needs_revision");
    expect(review.issues).toEqual(["缺验收标准"]);
    expect(review.missingInfo).toEqual(["目标"]);
  });
});
