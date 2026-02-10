import { describe, expect, it, vi } from "vitest";
import { LOCAL_TOOL_HANDLERS } from "@/background/ai/tools/local.ts";

vi.mock("@/background/storage.js", () => ({
  readSettings: vi.fn(async () => ({ aiAssistantEnabled: true, aiMcpServers: [], aiAgents: { conversation: {} } })),
}));

vi.mock("@/background/ai/runtime/agentSelection.js", () => ({
  resolveAgentTarget: vi.fn(() => ({
    provider: { id: "p1" },
    model: { model: "gpt-4", limits: { maxOutputTokens: 100 }, capabilities: { toolCalling: false } },
    temperature: 0.2,
  })),
}));

vi.mock("@/background/ai/runtime/providerSession.js", () => ({
  createProviderSession: vi.fn(() => ({
    listTools: () => [],
    connectMcp: vi.fn(async () => undefined),
    mcp: {
      setConversationContext: vi.fn(),
      setActiveToolFilter: vi.fn(),
    },
    client: {
      createCompletion: vi.fn(async () => ({
        choices: [{ message: { content: "done" } }],
      })),
    },
    clientWithTools: {
      createCompletion: vi.fn(async () => ({
        choices: [{ message: { content: "done" } }],
      })),
    },
  })),
}));

vi.mock("@/background/ai/skills/storage.js", () => ({
  listSkills: vi.fn(async () => []),
}));

describe("PromptingAgent tool", () => {
  it("returns error when prompt is missing", async () => {
    const result = await LOCAL_TOOL_HANDLERS.PromptingAgent({});
    expect(result.isError).toBe(true);
  });

  it("executes prompting agent and returns output", async () => {
    const result = await LOCAL_TOOL_HANDLERS.PromptingAgent({ prompt: "rewrite" });
    expect(result.data.output).toBe("done");
  });
});
