import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { AIAssistantSettings, AIProviderSetting } from "../../settings.js"
import type { ToolDefinition } from "../types.js"
import { McpCapability } from "../capabilities/mcp.js"
import { createOpenAICompatibleClients } from "../providers/factory.js"
import { resolveActiveProvider } from "./resolveProvider.js"
import {
  buildRequestHeaders,
  getApiEndpoint,
  getApiKey,
} from "./requestHeaders.js"
import { syncRequestHeaderRules } from "./syncHeaderRules.js"

export interface AiSession {
  provider: AIProviderSetting | null
  settings: Partial<AIAssistantSettings> & Partial<AIProviderSetting>
  isEnabled: boolean
  mcp: McpCapability
  client: ReturnType<typeof createOpenAICompatibleClients>["client"]
  clientWithTools: ReturnType<typeof createOpenAICompatibleClients>["clientWithTools"]
  connectMcp: () => Promise<void>
  disconnectMcp: () => Promise<void>
  getToolSpecs: () => Promise<Array<{ type: "function"; function: ToolDefinition }>>
}

function toToolSpecs(tools: Tool[]): Array<{ type: "function"; function: ToolDefinition }> {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    } as ToolDefinition,
  }))
}

export function createAiSession(
  settings: AIAssistantSettings,
  options: { allowUntested?: boolean } = {},
): AiSession {
  const allowUntested = Boolean(options.allowUntested)
  const resolved = resolveActiveProvider(settings, { allowUntested })
  const provider = resolved.provider
  const merged = { ...resolved.fallbackSettings, ...(provider || {}) }

  const isEnabled = Boolean(
    merged.aiAssistantEnabled &&
      provider &&
      (allowUntested || provider.lastTestStatus?.ok === true) &&
      getApiEndpoint(merged) &&
      getApiKey(merged),
  )

  const endpointGetter = () => getApiEndpoint(merged)
  const headersGetter = () => buildRequestHeaders(merged)
  const syncHeaders = () => syncRequestHeaderRules(provider, merged)

  const mcp = new McpCapability({
    getServers: () => merged.aiMcpServers || [],
  })

  const getToolSpecs = async () => toToolSpecs(mcp.listTools())

  const clients = createOpenAICompatibleClients(
    {
      endpoint: endpointGetter,
      buildHeaders: headersGetter,
      syncHeaders,
    },
    {
      getTools: getToolSpecs,
      executeToolCall: (toolCall) => mcp.executeToolCall(toolCall as any),
    },
  )

  return {
    provider,
    settings: merged,
    isEnabled,
    mcp,
    client: clients.client,
    clientWithTools: clients.clientWithTools,
    connectMcp: () => mcp.connect(),
    disconnectMcp: () => mcp.disconnect(),
    getToolSpecs,
  }
}

