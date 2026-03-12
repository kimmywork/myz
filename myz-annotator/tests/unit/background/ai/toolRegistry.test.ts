import { describe, expect, it, vi } from "vitest";
import {
  executeToolCall,
  listAvailableTools,
  registerLocalTools,
} from "@/background/ai/tools/registry.ts";
const LOCAL_TOOL_DEFINITIONS = [
  { name: "LocalTool", description: "local", inputSchema: {} },
];
const LOCAL_TOOL_HANDLERS = {
  LocalTool: vi.fn(async (args: any) => ({
    content: [{ type: "text", text: `ok:${args.value}` }],
  })),
};

function createMcpClient() {
  return {
    getTools: () => [
      { name: "RemoteTool", description: "remote", inputSchema: {} },
    ],
    callTool: vi.fn(async () => ({
      content: [{ type: "text", text: "remote-ok" }],
    })),
  };
}

describe("tool registry", () => {
  it("lists local + mcp tools", () => {
    registerLocalTools({
      definitions: LOCAL_TOOL_DEFINITIONS as any,
      handlers: LOCAL_TOOL_HANDLERS as any,
    });
    const mcpClients = new Map([["server", createMcpClient()] as any]);
    const tools = listAvailableTools(mcpClients as any);
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual(["LocalTool", "RemoteTool"].sort());
  });

  it("executes local tools by name", async () => {
    registerLocalTools({
      definitions: LOCAL_TOOL_DEFINITIONS as any,
      handlers: LOCAL_TOOL_HANDLERS as any,
    });
    const result = await executeToolCall(new Map(), {
      function: { name: "LocalTool", arguments: JSON.stringify({ value: 1 }) },
    });
    const textBlock = result.content.find(
      (block: any) => block.type === "text",
    ) as any;
    expect(textBlock?.text).toBe("ok:1");
  });

  it("executes remote tools when local not found", async () => {
    registerLocalTools({ definitions: [], handlers: {} });
    const client = createMcpClient();
    const result = await executeToolCall(new Map([["server", client] as any]), {
      function: { name: "RemoteTool", arguments: "{}" },
    });
    const textBlock = result.content.find(
      (block: any) => block.type === "text",
    ) as any;
    expect(textBlock?.text).toBe("remote-ok");
  });
});
