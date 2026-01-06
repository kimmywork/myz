import { Tool } from "@modelcontextprotocol/sdk/types.js"
import { McpClient } from "../../mcp.js"
import { LOCAL_TOOL_DEFINITIONS, LOCAL_TOOL_HANDLERS, ToolExecutionResult } from "./local.js"

export interface ToolCallLike {
  function: { name: string; arguments: string }
}

function buildToolCandidates(rawName: string) {
  const fallbackName =
    typeof rawName === "string" && rawName.includes(":")
      ? rawName.split(":").pop() || rawName
      : rawName
  return Array.from(
    new Set(
      [rawName, fallbackName].filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      ),
    ),
  )
}

export function listAvailableTools(mcpClients: Map<string, McpClient>) {
  const tools: Tool[] = []

  tools.push(
    ...LOCAL_TOOL_DEFINITIONS.map((tool) => ({
      ...tool,
      server: "myz-local",
    })),
  )

  for (const [serverName, client] of mcpClients) {
    const serverTools = client.getTools()
    tools.push(
      ...serverTools.map((tool) => ({
        ...tool,
        server: serverName,
      })),
    )
  }

  return tools
}

export async function executeToolCall(
  mcpClients: Map<string, McpClient>,
  toolCall: ToolCallLike,
): Promise<ToolExecutionResult> {
  const { name: rawName, arguments: args } = toolCall.function
  const candidates = buildToolCandidates(rawName)

  for (const name of candidates) {
    if (!LOCAL_TOOL_HANDLERS[name]) continue
    let parsedArgs = {}
    try {
      parsedArgs = args ? JSON.parse(args) : {}
    } catch {
      parsedArgs = {}
    }
    return LOCAL_TOOL_HANDLERS[name](parsedArgs)
  }

  for (const [, client] of mcpClients) {
    const tools = client.getTools()
    const resolvedName = candidates.find((candidate) =>
      tools.some((tool) => tool.name === candidate),
    )
    if (!resolvedName) continue

    try {
      const result = await client.callTool(resolvedName, JSON.parse(args))
      return {
        content: result.content,
        data: result.data,
        isError: result.isError,
      }
    } catch (error) {
      throw new Error(`Tool execution failed: ${(error as Error).message}`)
    }
  }

  throw new Error(`Tool not found: ${rawName}`)
}

