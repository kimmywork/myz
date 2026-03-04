import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { McpClient } from "../../mcp.js";
import { LOCAL_TOOL_DEFINITIONS, LOCAL_TOOL_HANDLERS } from "./local.js";
import type { ToolExecutionResult } from "../types.js";
import { isRecord } from "@/shared/typeUtils";

export interface ToolCallLike {
  function: { name: string; arguments: string | Record<string, unknown> };
}

function buildToolCandidates(rawName: string) {
  const fallbackName =
    typeof rawName === "string" && rawName.includes(":")
      ? rawName.split(":").pop() || rawName
      : rawName;
  return Array.from(
    new Set(
      [rawName, fallbackName].filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    ),
  );
}

export type ToolWithServer = Tool & { server: string };

export function listAvailableTools(
  mcpClients: Map<string, McpClient>,
): ToolWithServer[] {
  const tools: ToolWithServer[] = [];

  tools.push(
    ...LOCAL_TOOL_DEFINITIONS.map((tool) => ({
      ...tool,
      server: "myz-local",
    })),
  );

  for (const [serverName, client] of mcpClients) {
    const serverTools = client.getTools();
    tools.push(
      ...serverTools.map((tool) => ({
        ...tool,
        server: serverName,
      })),
    );
  }

  return tools;
}

export async function executeToolCall(
  mcpClients: Map<string, McpClient>,
  toolCall: ToolCallLike,
): Promise<ToolExecutionResult> {
  const { name: rawName, arguments: args } = toolCall.function;
  const candidates = buildToolCandidates(rawName);

  for (const name of candidates) {
    if (!LOCAL_TOOL_HANDLERS[name]) continue;
    let parsedArgs: Record<string, unknown> = {};
    if (typeof args === "string") {
      try {
        parsedArgs = args ? JSON.parse(args) : {};
      } catch {
        parsedArgs = {};
      }
    } else if (isRecord(args)) {
      parsedArgs = { ...args };
    }
    return LOCAL_TOOL_HANDLERS[name](parsedArgs);
  }

  for (const [, client] of mcpClients) {
    const tools = client.getTools();
    const resolvedName = candidates.find((candidate) =>
      tools.some((tool) => tool.name === candidate),
    );
    if (!resolvedName) continue;

    try {
      const parsedArgs =
        typeof args === "string"
          ? JSON.parse(args || "{}")
          : isRecord(args)
            ? args
            : {};
      const result = await client.callTool(resolvedName, parsedArgs);
      return {
        content: result.content,
        data: result.data,
        isError: result.isError,
      };
    } catch (error) {
      throw new Error(`Tool execution failed: ${(error as Error).message}`);
    }
  }

  throw new Error(`Tool not found: ${rawName}`);
}
