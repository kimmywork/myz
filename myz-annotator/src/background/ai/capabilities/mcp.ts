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

  constructor(options: McpCapabilityOptions) {
    this.clients = new Map()
    this.getServers = options.getServers
  }

  getClientCount() {
    return this.clients.size
  }

  getClients() {
    return this.clients
  }

  listTools(): Tool[] {
    return listAvailableTools(this.clients)
  }

  async executeToolCall(toolCall: ToolCallLike): Promise<ToolExecutionResult> {
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
