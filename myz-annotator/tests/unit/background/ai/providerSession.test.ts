import { describe, expect, it, vi } from "vitest";
import { createProviderSession } from "@/background/ai/runtime/providerSession.ts";

const listToolsMock = vi.hoisted(() =>
  vi.fn(() => [
    { name: "ToolA", description: "A", inputSchema: { type: "object" } },
  ]),
);

vi.mock("@myz/ai-core/capabilities/mcp", () => ({
  McpCapability: class {
    listTools = listToolsMock;
    connect = vi.fn(async () => undefined);
    disconnect = vi.fn(async () => undefined);
    executeToolCall = vi.fn(async () => ({
      content: [{ type: "text", text: "ok" }],
    }));
  },
}));

const createProviderClientsMock = vi.hoisted(() =>
  vi.fn(() => ({
    client: { createCompletion: vi.fn() },
    clientWithTools: { createCompletion: vi.fn() },
  })),
);

vi.mock("@myz/ai-core/providers/registry", () => ({
  createProviderClients: createProviderClientsMock,
}));

describe("providerSession", () => {
  it("exposes tool specs to provider clients", async () => {
    const session = createProviderSession(
      {
        id: "p1",
        name: "Provider",
        type: "openai_compatible",
        enabled: true,
        baseUrl: "http://localhost",
        apiKey: "key",
      } as any,
      [],
    );

    const call = createProviderClientsMock.mock.calls[0] as any[] | undefined;
    expect(call).toBeTruthy();
    const tooling = call?.[1] as any;
    const toolSpecs = await tooling.getTools();
    expect(toolSpecs[0]).toMatchObject({
      type: "function",
      function: { name: "ToolA" },
    });
    expect(session.listTools()).toHaveLength(1);
  });
});
