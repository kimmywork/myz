import { describe, expect, it } from "vitest";
import {
  resolveModelRef,
  resolveAgentTarget,
  resolveConversationMultimodalTarget,
} from "@/background/ai/runtime/agentSelection.ts";

describe("agentSelection", () => {
  const settings: any = {
    aiProviders: [
      {
        id: "p1",
        name: "Provider",
        type: "openai_compatible",
        enabled: true,
        lastTest: { ok: true },
        models: [
          {
            id: "m1",
            model: "gpt-4",
            enabled: true,
            capabilities: { vision: true },
          },
        ],
      },
    ],
    aiAgents: {
      conversation: {
        target: { providerId: "p1", modelId: "m1" },
        temperature: 0.4,
      },
    },
  };

  it("resolves model ref", () => {
    const result = resolveModelRef(settings, {
      providerId: "p1",
      modelId: "m1",
    });
    expect(result.model.id).toBe("m1");
  });

  it("resolves agent target", () => {
    const result = resolveAgentTarget(settings, "conversation");
    expect(result.temperature).toBe(0.4);
  });

  it("resolves conversation multimodal target", () => {
    const result = resolveConversationMultimodalTarget({
      ...settings,
      aiAgents: {
        conversation: {
          target: { providerId: "p1", modelId: "m1" },
          multimodalTarget: { providerId: "p1", modelId: "m1" },
          temperature: 0.3,
          compressImages: true,
        },
      },
    });
    expect(result?.model.id).toBe("m1");
    expect(result?.compressImages).toBe(true);
  });
});
