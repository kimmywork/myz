import { describe, expect, it, vi } from "vitest";
import { createOpenAICompatibleClients } from "@/background/ai/providers/factory.ts";

const baseCreate = vi.fn(async () => ({ choices: [] }));

vi.mock("@/background/ai/providers/openaiCompatible/jsonClient.js", () => ({
  OpenAICompatibleJsonClient: class {
    createCompletion = baseCreate;
    constructor() {}
  },
  shouldUseDeveloperRole: () => false,
}));

const toolCallingWrapper = vi.fn((client: any) => ({
  async createCompletion(...args: any[]) {
    return client.createCompletion(...args);
  },
}));

vi.mock("@/background/ai/providers/capabilities/toolCalling.js", () => ({
  createToolCallingCapability: () => toolCallingWrapper,
}));

vi.mock("@/background/ai/providers/capabilities/googleGemini.js", () => ({
  createGoogleGeminiThinkingCapability: () => (client: any) => client,
}));

vi.mock("@/background/ai/providers/capabilities/reasoning.js", () => ({
  createReasoningNormalizationCapability: () => (client: any) => client,
}));

vi.mock("@/background/ai/providers/capabilities/sseStreaming.js", () => ({
  createSseStreamingCapability: () => (client: any) => client,
}));

describe("provider factory", () => {
  it("creates client and clientWithTools", async () => {
    const clients = createOpenAICompatibleClients(
      { endpoint: "http://localhost", buildHeaders: {} },
      { getTools: async () => [], executeToolCall: async () => ({ content: [] }) },
    );

    await clients.client.createCompletion({} as any, {} as any);
    await clients.clientWithTools.createCompletion({} as any, {} as any);
    expect(toolCallingWrapper).toHaveBeenCalled();
    expect(baseCreate).toHaveBeenCalled();
  });
});
