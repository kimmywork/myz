import {
  JSONRPC_VERSION,
  LATEST_PROTOCOL_VERSION,
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type InitializeRequest,
  type InitializeResult,
  type CallToolRequest,
  type CallToolResult,
  type ListToolsRequest,
  type ListToolsResult,
  type ListResourcesRequest,
  type ListResourcesResult,
  type ClientRequest,
  type ClientNotification,
  type ServerNotification,
  type JSONRPCNotification,
  type ReadResourceRequest,
  type ReadResourceResult,
  type Resource,
  type Tool,
} from "./mcp_schema";

export const MCP_MESSAGE_TYPES = {
  REQUEST: "request",
  NOTIFICATION: "notification",
  RESULT: "result",
  ERROR: "error",
};

export interface ServerConfig {
  url: string;
  headers?: Record<string, string>;
}

export class McpClient {
  private serverConfig: ServerConfig;
  private sessionId: string | null;
  private protocolVersion: string;
  private isConnected: boolean;
  private tools: Tool[];
  private resources: Resource[];
  private requestId: number;
  private pendingRequests: Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      timeoutId: NodeJS.Timeout;
    }
  >;

  constructor(serverConfig: ServerConfig) {
    this.serverConfig = serverConfig;
    this.sessionId = null;
    this.protocolVersion = LATEST_PROTOCOL_VERSION;
    this.isConnected = false;
    this.tools = [];
    this.resources = [];
    this.requestId = 0;
    this.pendingRequests = new Map();
  }

  async connect() {
    try {
      const { url } = this.serverConfig;

      // Validate URL
      if (!url || !url.startsWith("http")) {
        throw new Error("Invalid MCP server URL");
      }

      this.isConnected = true;
      // Session ID will be set during initialize() - either from server response or generated if server doesn't provide one

      // Initialize connection and get tools/resources
      await this.initialize();

      return { success: true, tools: this.tools, resources: this.resources };
    } catch (error) {
      this.isConnected = false;
      throw error;
    }
  }

  async initialize() {
    if (!this.isConnected) {
      throw new Error("Not connected to MCP server");
    }

    try {
      console.log("[MCP Debug] Starting MCP initialization...");

      // Step 1: Send initialize request as per MCP spec
      const initResult = await this.request<
        InitializeRequest,
        InitializeResult
      >("initialize", {
        protocolVersion: this.protocolVersion,
        capabilities: {
          roots: { listChanged: false },
        },
        clientInfo: {
          name: "myz-annotator",
          version: "0.1.4",
        },
      });

      console.log("[MCP Debug] Initialize response:", initResult);

      // Store session ID if provided by server in response body
      if (initResult?.sessionId) {
        this.sessionId = initResult.sessionId as string;
        console.log(
          "[MCP Debug] Stored session ID from response body:",
          this.sessionId,
        );
      }

      // If we still don't have a session ID (server didn't provide one), generate it
      if (!this.sessionId) {
        this.sessionId = `session-${Date.now()}`;
        console.log(
          "[MCP Debug] Generated session ID (server did not provide one):",
          this.sessionId,
        );
      }

      // Step 2: Send initialized notification (MUST NOT have params per spec)
      // Note: LogSeq's MCP server may fail this notification with HTTP 400,
      // but we continue anyway as it's optional according to the spec
      try {
        await this.notification("notifications/initialized");
        console.log("[MCP Debug] Initialized notification sent successfully");
      } catch (error) {
        console.warn(
          "[MCP Debug] notifications/initialized failed (continuing anyway):",
          (error as Error).message,
        );
      }

      // Step 3: Get tools and resources
      console.log("[MCP Debug] Requesting tools list...");
      const toolsResult = await this.request<ListToolsRequest, ListToolsResult>(
        "tools/list",
        {},
      );
      this.tools = Array.isArray(toolsResult?.tools) ? toolsResult.tools : [];

      console.log("[MCP Debug] Requesting resources list...");
      try {
        const resourcesResult = await this.request<
          ListResourcesRequest,
          ListResourcesResult
        >("resources/list", {});
        this.resources = Array.isArray(resourcesResult?.resources)
          ? resourcesResult.resources
          : [];
      } catch (error) {
        console.warn(
          "[MCP Debug] resources/list not supported by server (optional), continuing...",
        );
        this.resources = [];
      }

      console.log(
        "[MCP Debug] MCP initialization complete:",
        this.tools.length,
        "tools,",
        this.resources.length,
        "resources",
      );

      return {
        tools: this.tools,
        resources: this.resources,
        serverInfo: initResult?.serverInfo,
        capabilities: initResult?.capabilities,
        sessionId: initResult?.sessionId,
      };
    } catch (error) {
      console.error("Failed to initialize MCP session:", error);
      throw error;
    }
  }

  async request<ParamRequest extends ClientRequest, Result>(
    method: string,
    params: ParamRequest["params"],
  ): Promise<Result> {
    if (!this.isConnected) {
      throw new Error("MCP client not connected");
    }

    const requestId = ++this.requestId;
    const message: JSONRPCRequest = {
      jsonrpc: JSONRPC_VERSION,
      id: requestId,
      method,
      params: params,
    };

    return new Promise((resolve, reject) => {
      // Set timeout for request
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`MCP request timeout: ${method}`));
      }, 30000); // 30 second timeout

      this.pendingRequests.set(requestId, {
        resolve: (value) => resolve(value as Result),
        reject,
        timeoutId,
      });

      // Send request via HTTP POST
      this.sendHttpRequest(message).catch((error) => {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  async sendHttpRequest(message: JSONRPCMessage) {
    const { url, headers = {} } = this.serverConfig;

    // MCP Streaming HTTP requires specific headers
    // Accept must list both application/json and text/event-stream
    // NOTE: Mcp-Session-Id MUST NOT be included in initialize request (per spec)
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "User-Agent": "myz-annotator/0.1.4",
      "MCP-Protocol-Version": this.protocolVersion,
      ...headers,
    };

    // Add Mcp-Session-Id for all requests EXCEPT initialize
    // Note: LogSeq's mcp-logseq returns session ID in response header, not in body.
    // Some servers provide it in body, some in headers - we handle both.
    if (this.sessionId && (message as JSONRPCRequest).method !== "initialize") {
      requestHeaders["Mcp-Session-Id"] = this.sessionId;
    }

    // Debug log
    console.log("[MCP Debug] Sending POST to:", url);
    console.log("[MCP Debug] Headers:", requestHeaders);
    console.log("[MCP Debug] Body:", JSON.stringify(message, null, 2));

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Handle notifications (204 No Content) - they have no response body
      if (
        response.status === 204 ||
        response.headers.get("content-length") === "0"
      ) {
        // Notifications don't have a response body, just return
        console.log("[MCP Debug] Received 204 No Content for notification");
        return;
      }

      const result = (await response.json()) as JSONRPCMessage;

      // Extract session ID from response header if present (e.g., LogSeq mcp-logseq)
      // This happens for initialize requests where the server creates the session
      if (
        (message as JSONRPCRequest).method === "initialize" &&
        !this.sessionId
      ) {
        const sessionIdHeader = response.headers.get("mcp-session-id");
        if (sessionIdHeader) {
          this.sessionId = sessionIdHeader;
          console.log(
            "[MCP Debug] Extracted session ID from response header:",
            sessionIdHeader,
          );
        }
      }

      this.handleResponse(result);
    } catch (error) {
      console.error("MCP HTTP request failed:", error);
      const requestId = (message as JSONRPCRequest).id;
      if (requestId) {
        // Only reject if there's actually a request ID (not notifications)
        const pending = this.pendingRequests.get(requestId as number);
        if (pending) {
          this.pendingRequests.delete(requestId as number);
          clearTimeout(pending.timeoutId);
          pending.reject(error);
        }
      }
    }
  }

  handleResponse(message: JSONRPCMessage) {
    if ("id" in message) {
      const requestId =
        typeof message.id === "number" ? message.id : Number(message.id);
      const pending = this.pendingRequests.get(requestId);
      if (!pending) {
        return;
      }

      this.pendingRequests.delete(requestId);
      clearTimeout(pending.timeoutId);

      if ("error" in message) {
        pending.reject(
          new Error(message.error?.message || "MCP request failed"),
        );
        return;
      }

      pending.resolve((message as JSONRPCResponse).result);
      return;
    }

    if (!("id" in message) && (message as JSONRPCNotification).method) {
      this.handleNotification(message as ServerNotification);
    }
  }

  handleNotification(notification: ServerNotification) {
    console.log("MCP notification:", notification);
    // Handle notifications like resource updates, tool updates, etc.
    switch (notification.method) {
      case "notifications/resources/updated":
        // Refresh resources if needed
        break;
      case "notifications/tools/list_changed":
        // Refresh tools if needed
        break;
    }
  }

  async callTool(
    name: string,
    arguments_: Record<string, unknown> = {},
  ): Promise<CallToolResult> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    return this.request<CallToolRequest, CallToolResult>("tools/call", {
      name,
      arguments: arguments_,
    });
  }

  async notification<Notification extends ClientNotification>(
    method: Notification["method"],
    params: Notification["params"] | null = null,
  ): Promise<void> {
    if (!this.isConnected) {
      throw new Error("Not connected to MCP server");
    }

    // Notifications must NOT have an id field per JSON-RPC spec 6.0
    const message: JSONRPCNotification = {
      jsonrpc: JSONRPC_VERSION,
      method,
    };

    // Only add params if provided (some notifications like initialized have no params)
    if (params !== null && params !== undefined) {
      message.params = params;
    }

    console.log(
      "[MCP Debug] Sending notification:",
      method,
      params || "(no params)",
    );
    try {
      await this.sendHttpRequest(message);
      console.log("[MCP Debug] Notification sent successfully");
    } catch (error) {
      console.warn("MCP notification failed:", error);
    }
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    const resource = this.resources.find((r) => r.uri === uri);
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    return this.request<ReadResourceRequest, ReadResourceResult>(
      "resources/read",
      {
        uri,
      },
    );
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.sessionId = null;
    this.tools = [];
    this.resources = [];

    // Clear pending requests
    this.pendingRequests.forEach((pending) => {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("MCP client disconnected"));
    });
    this.pendingRequests.clear();
  }

  getTools(): Tool[] {
    return this.tools;
  }

  getResources(): Resource[] {
    return this.resources;
  }

  isReady(): boolean {
    return this.isConnected && this.sessionId !== null;
  }
}

export function createMcpClient(serverConfig: ServerConfig): McpClient {
  return new McpClient(serverConfig);
}

export async function testMcpConnection(serverConfig: ServerConfig) {
  const client = new McpClient(serverConfig);
  try {
    const result = await client.connect();
    await client.disconnect();
    return {
      success: true,
      tools: result.tools,
      resources: result.resources,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      error: message,
    };
  }
}
