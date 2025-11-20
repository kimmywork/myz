export const MCP_MESSAGE_TYPES = {
  REQUEST: "request",
  NOTIFICATION: "notification",
  RESULT: "result",
  ERROR: "error",
};

export class McpClient {
  constructor(serverConfig) {
    this.serverConfig = serverConfig;
    this.sessionId = null;
    this.protocolVersion = "2025-06-18";
    this.isConnected = false;
    this.tools = [];
    this.resources = [];
    this.requestId = 0;
    this.pendingRequests = new Map();
  }

  async connect() {
    try {
      const { url, headers = {} } = this.serverConfig;
      
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
      const initResult = await this.request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: { listChanged: false },
          resources: { subscribe: false, listChanged: false },
        },
        clientInfo: {
          name: "myz-annotator",
          version: "0.1.4",
        },
      });
      
      console.log("[MCP Debug] Initialize response:", initResult);
      
      // Store session ID if provided by server in response body
      if (initResult?.sessionId) {
        this.sessionId = initResult.sessionId;
        console.log("[MCP Debug] Stored session ID from response body:", this.sessionId);
      }
      
      // If we still don't have a session ID (server didn't provide one), generate it
      if (!this.sessionId) {
        this.sessionId = `session-${Date.now()}`;
        console.log("[MCP Debug] Generated session ID (server did not provide one):", this.sessionId);
      }
      
      // Step 2: Send initialized notification (MUST NOT have params per spec)
      // Note: LogSeq's MCP server may fail this notification with HTTP 400,
      // but we continue anyway as it's optional according to the spec
      try {
        await this.notification("notifications/initialized");
        console.log("[MCP Debug] Initialized notification sent successfully");
      } catch (error) {
        console.warn("[MCP Debug] notifications/initialized failed (continuing anyway):", error.message);
      }
      
      // Step 3: Get tools and resources
      console.log("[MCP Debug] Requesting tools list...");
      const toolsResult = await this.request("tools/list", {});
      this.tools = Array.isArray(toolsResult?.tools) ? toolsResult.tools : [];
      
      console.log("[MCP Debug] Requesting resources list...");
      try {
        const resourcesResult = await this.request("resources/list", {});
        this.resources = Array.isArray(resourcesResult?.resources) ? resourcesResult.resources : [];
      } catch (error) {
        console.warn("[MCP Debug] resources/list not supported by server (optional), continuing...");
        this.resources = [];
      }
      
      console.log("[MCP Debug] MCP initialization complete:", this.tools.length, "tools,", this.resources.length, "resources");
      
      return { 
        tools: this.tools, 
        resources: this.resources,
        serverInfo: initResult?.serverInfo,
        capabilities: initResult?.capabilities,
        sessionId: initResult?.sessionId
      };
    } catch (error) {
      console.error("Failed to initialize MCP session:", error);
      throw error;
    }
  }

  async request(method, params = {}) {
    if (!this.isConnected) {
      throw new Error("MCP client not connected");
    }

    const requestId = ++this.requestId;
    const message = {
      jsonrpc: "2.0",
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

      this.pendingRequests.set(requestId, { resolve, reject, timeoutId });
      
      // Send request via HTTP POST
      this.sendHttpRequest(message).catch((error) => {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  async sendHttpRequest(message) {
    const { url, headers = {} } = this.serverConfig;
    
    // MCP Streaming HTTP requires specific headers
    // Accept must list both application/json and text/event-stream
    // NOTE: Mcp-Session-Id MUST NOT be included in initialize request (per spec)
    const requestHeaders = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "User-Agent": "myz-annotator/0.1.4",
      "MCP-Protocol-Version": "2025-06-18",
      ...headers,
    };
    
    // Add Mcp-Session-Id for all requests EXCEPT initialize
    // Note: LogSeq's mcp-logseq returns session ID in response header, not in body.
    // Some servers provide it in body, some in headers - we handle both.
    if (this.sessionId && message.method !== "initialize") {
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
      if (response.status === 204 || response.headers.get("content-length") === "0") {
        // Notifications don't have a response body, just return
        console.log("[MCP Debug] Received 204 No Content for notification");
        return;
      }

      const result = await response.json();
      
      // Extract session ID from response header if present (e.g., LogSeq mcp-logseq)
      // This happens for initialize requests where the server creates the session
      if (message.method === "initialize" && !this.sessionId) {
        const sessionIdHeader = response.headers.get("mcp-session-id");
        if (sessionIdHeader) {
          this.sessionId = sessionIdHeader;
          console.log("[MCP Debug] Extracted session ID from response header:", sessionIdHeader);
        }
      }
      
      this.handleResponse(result);
    } catch (error) {
      console.error("MCP HTTP request failed:", error);
      const requestId = message.id;
      if (requestId) { // Only reject if there's actually a request ID (not notifications)
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          clearTimeout(pending.timeoutId);
          pending.reject(error);
        }
      }
    }
  }

  handleResponse(response) {
    if (response.id) {
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        this.pendingRequests.delete(response.id);
        clearTimeout(pending.timeoutId);
        
        if (response.error) {
          pending.reject(new Error(response.error.message || "MCP request failed"));
        } else {
          pending.resolve(response.result);
        }
      }
    } else if (response.method) {
      // Handle server notifications (e.g., resource updates)
      this.handleNotification(response);
    }
  }

  handleNotification(notification) {
    console.log("MCP notification:", notification);
    // Handle notifications like resource updates, tool updates, etc.
    switch (notification.method) {
      case "notifications/resources/updated":
        // Refresh resources if needed
        break;
      case "notifications/tools/updated":
        // Refresh tools if needed
        break;
    }
  }

  async callTool(name, arguments_ = {}) {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    return this.request("tools/call", {
      name,
      arguments: arguments_,
    });
  }

  async notification(method, params = null) {
    if (!this.isConnected) {
      throw new Error("Not connected to MCP server");
    }

    // Notifications must NOT have an id field per JSON-RPC spec 6.0
    const message = {
      jsonrpc: "2.0",
      method,
    };
    
    // Only add params if provided (some notifications like initialized have no params)
    if (params !== null && params !== undefined) {
      message.params = params;
    }

    console.log("[MCP Debug] Sending notification:", method, params || "(no params)");
    try {
      await this.sendHttpRequest(message);
      console.log("[MCP Debug] Notification sent successfully");
    } catch (error) {
      console.warn("MCP notification failed:", error);
    }
  }

  async readResource(uri) {
    const resource = this.resources.find((r) => r.uri === uri);
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    return this.request("resources/read", {
      uri,
    });
  }

  async disconnect() {
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

  getTools() {
    return this.tools;
  }

  getResources() {
    return this.resources;
  }

  isReady() {
    return this.isConnected && this.sessionId !== null;
  }
}

export function createMcpClient(serverConfig) {
  return new McpClient(serverConfig);
}

export async function testMcpConnection(serverConfig) {
  const client = new McpClient(serverConfig);
  try {
    const result = await client.connect();
    await client.disconnect();
    return {
      success: true,
      tools: result.tools,
      resources: result.resources,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}