import { describe, expect, it, vi } from "vitest";
import { ValidatorAgent } from "@/background/ai/agents/validatorAgent.ts";

describe("ValidatorAgent", () => {
  it("normalizes validation response", async () => {
    const client = {
      createCompletion: vi.fn(async () => ({
        choices: [
          {
            message: {
              content:
                "{\"status\":\"pass\",\"expectationScore\":88.7,\"deliverableScore\":91,\"issues\":[\" ok \"],\"missingDeliverables\":[]}",
            },
          },
        ],
      })),
    } as any;

    const agent = new ValidatorAgent();
    const result = await agent.validate({
      originalUserRequest: "test",
      taskPlan: { id: "tp", tasks: [] } as any,
      client,
      model: {
        model: "gpt-4",
        limits: { maxOutputTokens: 200, maxOutputTokenParam: "max_tokens" },
        capabilities: { reasoning: false },
      } as any,
    });

    expect(result.status).toBe("pass");
    expect(result.expectationScore).toBe(89);
    expect(result.issues).toEqual(["ok"]);
  });
});
