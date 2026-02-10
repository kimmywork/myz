import { describe, expect, it, vi } from "vitest";
import { McpCapability } from "@/background/ai/capabilities/mcp.ts";

const executeToolCallMock = vi.hoisted(() =>
  vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] })),
);
const listAvailableToolsMock = vi.hoisted(() =>
  vi.fn(() => [
    { name: "Task", server: "myz-local" },
    { name: "RemoteTool", server: "remote" },
  ]),
);

vi.mock("@/background/ai/tools/registry.js", () => ({
  executeToolCall: executeToolCallMock,
  listAvailableTools: listAvailableToolsMock,
}));

const connectMock = vi.hoisted(() => vi.fn(async () => undefined));
const disconnectMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/background/mcp.js", () => ({
  McpClient: class {
    connect = connectMock;
    disconnect = disconnectMock;
    getTools = vi.fn(() => []);
  },
}));

describe("McpCapability", () => {
  it("filters tools by allowlist and active filter", () => {
    const mcp = new McpCapability({ getServers: () => [] });
    mcp.setLocalToolAllowlist(["Task"]);
    mcp.setActiveToolFilter(["Task"]);
    const tools = mcp.listTools();
    expect(tools).toEqual([{ name: "Task", server: "myz-local" }]);
  });

  it("injects conversationId for Task calls", async () => {
    const mcp = new McpCapability({ getServers: () => [] });
    mcp.setConversationContext({ conversationId: "conv-1" });
    await mcp.executeToolCall({
      function: { name: "Task", arguments: JSON.stringify({ action: "get" }) },
    });
    const call = executeToolCallMock.mock.calls[0] as any[] | undefined;
    expect(call).toBeTruthy();
    const toolCall = call?.[1] as any;
    const args = JSON.parse(toolCall.function.arguments);
    expect(args.conversationId).toBe("conv-1");
  });

  it("connects and disconnects enabled servers", async () => {
    const mcp = new McpCapability({
      getServers: () => [
        { name: "server", id: "s1", enabled: true, url: "http://localhost" },
      ],
    });
    await mcp.connect();
    await mcp.disconnect();
    expect(connectMock).toHaveBeenCalled();
    expect(disconnectMock).toHaveBeenCalled();
  });
});
