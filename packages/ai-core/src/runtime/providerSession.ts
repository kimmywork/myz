import type { AIProviderSetting, McpServerSetting } from "../settings"
import { McpCapability } from "../capabilities/mcp"
import { createProviderClients } from "../providers/registry"
import type { ChatCompletionClient } from "../providers/types"
import type { ToolDefinition } from "../types"
import type { ToolWithServer } from "../tools/registry"

export interface ProviderSession {
  provider: AIProviderSetting
  mcp: McpCapability
  client: ChatCompletionClient
  clientWithTools: ChatCompletionClient
  connectMcp: () => Promise<void>
  disconnectMcp: () => Promise<void>
  listTools: () => ToolWithServer[]
}

function toToolSpecs(
  tools: ToolWithServer[],
): Array<{ type: "function"; function: ToolDefinition }> {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    } as ToolDefinition,
  }))
}

export function createProviderSession(
  provider: AIProviderSetting,
  mcpServers: McpServerSetting[] = [],
): ProviderSession {
  const mcp = new McpCapability({
    getServers: () => mcpServers,
  })

  const getToolSpecs = async () => toToolSpecs(mcp.listTools())

  const clients = createProviderClients(provider, {
    getTools: getToolSpecs,
    executeToolCall: (toolCall) => mcp.executeToolCall(toolCall),
  })

  return {
    provider,
    mcp,
    client: clients.client,
    clientWithTools: clients.clientWithTools,
    connectMcp: () => mcp.connect(),
    disconnectMcp: () => mcp.disconnect(),
    listTools: () => mcp.listTools(),
  }
}
