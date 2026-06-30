import { describe, expect, it, vi } from "vitest";
import { createOpenAICompatibleClients } from "@/background/ai/providers/factory.ts";

const baseCreate = vi.fn(async () => ({ choices: [] }));

vi.mock("@myz/ai-core/providers/openaiCompatible/jsonClient", () => ({
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

vi.mock("@myz/ai-core/providers/capabilities/toolCalling", () => ({
  createToolCallingCapability: () => toolCallingWrapper,
}));

vi.mock("@myz/ai-core/providers/capabilities/googleGemini", () => ({
  createGoogleGeminiThinkingCapability: () => (client: any) => client,
}));

vi.mock("@myz/ai-core/providers/capabilities/reasoning", () => ({
  createReasoningNormalizationCapability: () => (client: any) => client,
}));

vi.mock("@myz/ai-core/providers/capabilities/sseStreaming", () => ({
  createSseStreamingCapability: () => (client: any) => client,
}));

describe("provider factory", () => {
  it("creates client and clientWithTools", async () => {
    const clients = createOpenAICompatibleClients(
      { endpoint: "http://localhost", buildHeaders: {} },
      {
        getTools: async () => [],
        executeToolCall: async () => ({ content: [] }),
      },
    );

    await clients.client.createCompletion({} as any, {} as any);
    await clients.clientWithTools.createCompletion({} as any, {} as any);
    expect(toolCallingWrapper).toHaveBeenCalled();
    expect(baseCreate).toHaveBeenCalled();
  });
});
