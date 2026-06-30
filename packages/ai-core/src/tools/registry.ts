import { Tool } from "@modelcontextprotocol/sdk/types.js"
import { isRecord } from "@myz/shared/typeUtils"
import { McpClient } from "../mcp"
import type { ToolExecutionResult } from "../types"

export interface ToolCallLike {
  function: { name: string; arguments: string | Record<string, unknown> }
}

export type LocalToolHandler = (
  args: Record<string, unknown>,
) => Promise<ToolExecutionResult> | ToolExecutionResult

export interface LocalToolRegistry {
  definitions: Tool[]
  handlers: Record<string, LocalToolHandler>
}

const DEFAULT_LOCAL_TOOLS: LocalToolRegistry = {
  definitions: [],
  handlers: {},
}

let activeLocalTools: LocalToolRegistry = DEFAULT_LOCAL_TOOLS

export function registerLocalTools(registry: LocalToolRegistry) {
  activeLocalTools = registry || DEFAULT_LOCAL_TOOLS
}

export function getLocalTools(): LocalToolRegistry {
  return activeLocalTools || DEFAULT_LOCAL_TOOLS
}

function buildToolCandidates(rawName: string) {
  const fallbackName =
    typeof rawName === "string" && rawName.includes(":")
      ? rawName.split(":").pop() || rawName
      : rawName
  return Array.from(
    new Set(
      [rawName, fallbackName].filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      ),
    ),
  )
}

export type ToolWithServer = Tool & { server: string }

export function listAvailableTools(
  mcpClients: Map<string, McpClient>,
  localTools: LocalToolRegistry = getLocalTools(),
): ToolWithServer[] {
  const tools: ToolWithServer[] = []

  tools.push(
    ...((localTools?.definitions || []) as Tool[]).map((tool: Tool) => ({
      ...tool,
      server: "myz-local",
    })),
  )

  for (const [serverName, client] of mcpClients) {
    const serverTools = client.getTools()
    tools.push(
      ...(serverTools as Tool[]).map((tool: Tool) => ({
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
  localTools: LocalToolRegistry = getLocalTools(),
): Promise<ToolExecutionResult> {
  const { name: rawName, arguments: args } = toolCall.function
  const candidates = buildToolCandidates(rawName)

  for (const name of candidates) {
    const handler = localTools?.handlers?.[name]
    if (!handler) continue
    let parsedArgs: Record<string, unknown> = {}
    if (typeof args === "string") {
      try {
        parsedArgs = args ? JSON.parse(args) : {}
      } catch {
        parsedArgs = {}
      }
    } else if (isRecord(args)) {
      parsedArgs = { ...args }
    }
    return handler(parsedArgs)
  }

  for (const [, client] of mcpClients) {
    const tools = client.getTools()
    const resolvedName = candidates.find((candidate) =>
      (tools as Tool[]).some((tool: Tool) => tool.name === candidate),
    )
    if (!resolvedName) continue

    try {
      const parsedArgs =
        typeof args === "string"
          ? JSON.parse(args || "{}")
          : isRecord(args)
            ? args
            : {}
      const result = await client.callTool(resolvedName, parsedArgs)
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
