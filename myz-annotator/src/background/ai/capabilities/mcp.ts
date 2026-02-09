import type { Tool } from "@modelcontextprotocol/sdk/types.js"
import type { McpServerSetting } from "../../settings.js"
import { McpClient } from "../../mcp.js"
import type { ToolExecutionResult } from "../types.js"
import {
  executeToolCall,
  listAvailableTools,
  type ToolCallLike,
} from "../tools/registry.js"

export interface McpCapabilityOptions {
  getServers: () => McpServerSetting[]
}

export class McpCapability {
  private clients: Map<string, McpClient>
  private getServers: () => McpServerSetting[]
  private localToolAllowlist: Set<string> | null
  private activeToolFilter: Set<string> | null
  private conversationContext: { conversationId?: string } | null

  constructor(options: McpCapabilityOptions) {
    this.clients = new Map()
    this.getServers = options.getServers
    this.localToolAllowlist = null
    this.activeToolFilter = null
    this.conversationContext = null
  }

  getClientCount() {
    return this.clients.size
  }

  getClients() {
    return this.clients
  }

  /**
   * Restricts which local tools are exposed/executable.
   * Pass `null` to allow all local tools.
   */
  setLocalToolAllowlist(toolNames: string[] | null) {
    if (!toolNames) {
      this.localToolAllowlist = null
      return
    }
    this.localToolAllowlist = new Set(
      toolNames
        .filter((name) => typeof name === "string" && name.trim())
        .map((name) => name.trim()),
    )
  }

  /**
   * Restricts which tools (local + MCP) are exposed/executable for the current
   * request. Pass `null` to disable this per-request filter.
   */
  setActiveToolFilter(toolNames: string[] | null) {
    if (!toolNames) {
      this.activeToolFilter = null
      return
    }
    this.activeToolFilter = new Set(
      toolNames
        .filter((name) => typeof name === "string" && name.trim())
        .map((name) => name.trim()),
    )
  }

  setConversationContext(context: { conversationId?: string } | null) {
    if (!context) {
      this.conversationContext = null
      return
    }
    const conversationId =
      typeof context.conversationId === "string" ? context.conversationId.trim() : ""
    this.conversationContext = conversationId ? { conversationId } : null
  }

  private filterTools(tools: Tool[]) {
    const localAllowlist = this.localToolAllowlist
    const activeFilter = this.activeToolFilter
    return (tools || []).filter((tool: any) => {
      const name = typeof tool?.name === "string" ? tool.name : ""
      if (!name) return false
      const server = typeof tool?.server === "string" ? tool.server : ""
      if (server === "myz-local" && localAllowlist && !localAllowlist.has(name)) {
        return false
      }
      if (activeFilter && !activeFilter.has(name)) {
        return false
      }
      return true
    })
  }

  listTools(): Tool[] {
    const allTools = listAvailableTools(this.clients)
    return this.filterTools(allTools)
  }

  private buildToolCandidates(rawName: string) {
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

  async executeToolCall(toolCall: ToolCallLike): Promise<ToolExecutionResult> {
    const rawName = toolCall?.function?.name || ""
    const allowed = new Set(this.listTools().map((tool: any) => tool.name))
    const candidates = this.buildToolCandidates(rawName)
    const isAllowed = candidates.some((candidate) => allowed.has(candidate))
    if (!isAllowed) {
      throw new Error(`Tool not enabled: ${rawName}`)
    }
    const contextId = this.conversationContext?.conversationId
    if (contextId && candidates.includes("Task")) {
      const rawArgs = toolCall?.function?.arguments
      let parsed: any = {}
      if (typeof rawArgs === "string") {
        try {
          parsed = JSON.parse(rawArgs)
        } catch {
          parsed = {}
        }
      } else if (rawArgs && typeof rawArgs === "object") {
        parsed = { ...(rawArgs as Record<string, any>) }
      }
      parsed.conversationId = contextId
      const nextArgs = JSON.stringify(parsed)
      toolCall = {
        ...toolCall,
        function: {
          ...toolCall.function,
          arguments: nextArgs,
        },
      }
    }
    return executeToolCall(this.clients, toolCall)
  }

  async connect(): Promise<void> {
    const servers = this.getServers()
    if (!Array.isArray(servers) || !servers.length) {
      return
    }

    for (const serverConfig of servers) {
      if (!serverConfig?.enabled || !serverConfig.url) {
        continue
      }

      try {
        const serverUrl = serverConfig.url.endsWith("/")
          ? serverConfig.url.slice(0, -1)
          : serverConfig.url
        const client = new McpClient({ ...serverConfig, url: serverUrl })
        await client.connect()
        this.clients.set(serverConfig.name, client)
      } catch (error) {
        console.error(
          `Failed to connect to MCP server ${serverConfig.name}:`,
          error,
        )
      }
    }
  }

  async disconnect(): Promise<void> {
    for (const client of this.clients.values()) {
      await client.disconnect()
    }
    this.clients.clear()
  }
}
