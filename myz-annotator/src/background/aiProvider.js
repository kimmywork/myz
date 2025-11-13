import { McpClient, testMcpConnection } from "./mcp.js";
import { readAiConversations, addMessageToConversation } from "./ai.js";
import {
  saveMessage,
  getMessagesForConversation,
  getConversation,
} from "../sidepanel/aiStorage.js";

export class AiProvider {
  constructor(settings) {
    this.settings = settings;
    this.mcpClients = new Map();
    this.isEnabled =
      settings.aiAssistantEnabled &&
      settings.aiApiEndpoint &&
      settings.aiApiKey;
  }

  async testConnection() {
    if (!this.isEnabled) {
      throw new Error("AI Assistant is not enabled or configured");
    }

    // Determine model to use (support custom models)
    let model = this.settings.aiModel || "gpt-4";
    if (model === "custom" && this.settings.aiCustomModel) {
      model = this.settings.aiCustomModel;
    }

    try {
      const testPayload = {
        model,
        messages: [
          {
            role: "user",
            content:
              "Please respond with 'Connection successful' to confirm the API is working.",
          },
        ],
        max_tokens: 50,
      };

      const response = await this.makeApiRequest(testPayload);
      return {
        success: true,
        response: response.choices?.[0]?.message?.content || "",
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async makeApiRequest(payload) {
    const { aiApiEndpoint, aiApiKey } = this.settings;

    if (!aiApiEndpoint || !aiApiKey) {
      throw new Error("API endpoint or key not configured");
    }

    const response = await fetch(aiApiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiApiKey}`,
      },
      body: JSON.stringify({
        ...payload,
        stream: false, // We'll handle streaming separately if needed
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return response.json();
  }

  async generateResponse(messages, options = {}) {
    if (!this.isEnabled) {
      throw new Error("AI Assistant is not enabled");
    }

    // Determine model to use (support custom models)
    let model = this.settings.aiModel || "gpt-4";
    if (model === "custom" && this.settings.aiCustomModel) {
      model = this.settings.aiCustomModel;
    }

    // Determine max tokens based on context size setting
    const maxTokens = this.settings.aiMaxTokens || 32768;

    const payload = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature: options.temperature || 0.7,
      ...options,
    };

    // If MCP tools are available, include them in the request
    const mcpTools = await this.getAvailableTools();
    console.log(
      "[MCP Debug] getAvailableTools returned:",
      mcpTools.length,
      "tools",
    );
    if (mcpTools.length > 0) {
      payload.tools = mcpTools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema || {},
        },
      }));
      console.log(
        "[MCP Debug] Added tools to payload:",
        payload.tools?.length,
        "tools",
      );
    } else {
      console.log("[MCP Debug] No MCP tools available");
    }

    const response = await this.makeApiRequest(payload);

    // Handle tool calls if present
    const message = response.choices?.[0]?.message;
    if (message?.tool_calls) {
      // Save tool call message first
      const toolCallMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        conversationId: options.conversationId,
        role: "assistant",
        content: message.content || "", // Preserve content if present
        tool_calls: message.tool_calls,
        timestamp: new Date().toISOString(),
        metadata: {
          model: this.settings.aiModel,
          hasToolCalls: true,
          toolCallCount: message.tool_calls.length,
        },
      };
      await saveMessage(toolCallMessage);

      // Then handle the tool calls
      return await this.handleToolCalls(
        message,
        messages,
        options.conversationId,
      );
    }

    return response;
  }

  async handleToolCalls(message, previousMessages, conversationId) {
    const toolCalls = message.tool_calls;
    const followUpMessages = [
      ...previousMessages,
      message, // Original assistant message with tool calls
    ];

    for (const toolCall of toolCalls) {
      try {
        const result = await this.executeToolCall(toolCall);

        // Convert MCP result format to LLM API format
        // MCP returns: { content: [{type: "text", text: "..."}], isError: false }
        // LLM API expects: { role: "tool", tool_call_id: "...", content: "string" }
        let contentText = "";
        if (result?.content && Array.isArray(result.content)) {
          // Extract text from MCP content array
          contentText = result.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n");
        } else if (typeof result === "string") {
          contentText = result;
        } else {
          contentText = JSON.stringify(result);
        }

        // Save tool response to IndexedDB
        await saveMessage({
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          conversationId,
          role: "tool",
          content: contentText,
          tool_call_id: toolCall.id,
          timestamp: new Date().toISOString(),
          metadata: {
            toolName: toolCall.function?.name,
            toolArgs: toolCall.function?.arguments,
          },
        });

        followUpMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: contentText,
        });
      } catch (error) {
        const errorText = `Error: ${error.message}`;

        // Save error to IndexedDB
        await saveMessage({
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          conversationId,
          role: "tool",
          content: errorText,
          tool_call_id: toolCall.id,
          timestamp: new Date().toISOString(),
          metadata: {
            toolName: toolCall.function?.name,
            toolArgs: toolCall.function?.arguments,
            error: error.message,
          },
        });

        followUpMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: errorText,
        });
      }
    }

    return this.generateResponse(followUpMessages);
  }

  async executeToolCall(toolCall) {
    const { name, arguments: args } = toolCall.function;

    // Find which MCP client has this tool
    for (const [serverName, client] of this.mcpClients) {
      const tools = client.getTools();
      if (tools.some((tool) => tool.name === name)) {
        try {
          const result = await client.callTool(name, JSON.parse(args));
          return result;
        } catch (error) {
          throw new Error(`Tool execution failed: ${error.message}`);
        }
      }
    }

    throw new Error(`Tool not found: ${name}`);
  }

  async initializeMcpClients() {
    const { aiMcpServers = [] } = this.settings;
    console.log("[MCP Debug] initializeMcpClients with servers:", aiMcpServers);

    for (const serverConfig of aiMcpServers) {
      if (serverConfig.enabled && serverConfig.url) {
        try {
          // Ensure URL doesn't have trailing slash
          let serverUrl = serverConfig.url.endsWith("/")
            ? serverConfig.url.slice(0, -1)
            : serverConfig.url;
          console.log(
            "[MCP Debug] Connecting to server:",
            serverConfig.name,
            serverUrl,
          );

          const clientConfig = { ...serverConfig, url: serverUrl };
          const client = new McpClient(clientConfig);
          const result = await client.connect();
          this.mcpClients.set(serverConfig.name, client);
          console.log(
            `[MCP Debug] Connected to ${serverConfig.name}:`,
            result.tools?.length,
            "tools",
          );
        } catch (error) {
          console.error(
            `Failed to connect to MCP server ${serverConfig.name}:`,
            error,
          );
        }
      }
    }
    console.log(
      "[MCP Debug] Total MCP clients connected:",
      this.mcpClients.size,
    );
  }

  async getAvailableTools() {
    const tools = [];

    for (const [serverName, client] of this.mcpClients) {
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

  async disconnectMcpClients() {
    for (const client of this.mcpClients.values()) {
      await client.disconnect();
    }
    this.mcpClients.clear();
  }

  async processConversation(conversationId, action, content, options = {}) {
    // Save user message to IndexedDB
    const userMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      conversationId,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      metadata: { action, ...options.metadata },
    };
    await saveMessage(userMessage);

    // Get conversation history from IndexedDB
    const history = await this.getConversationMessages(conversationId);

    // Generate AI response
    const response = await this.generateResponse(history, options);

    // Check if response has both tool calls and content
    const message = response.choices?.[0]?.message;
    let assistantContent = message?.content || "";
    let toolCallInfo = "";

    if (message?.tool_calls && message.tool_calls.length > 0) {
      // Build tool call information to show to user
      toolCallInfo = message.tool_calls
        .map((call, i) => {
          const toolName = call.function?.name || "unknown";
          const args = call.function?.arguments
            ? JSON.parse(call.function.arguments)
            : {};
          return `[Tool ${i + 1}: ${toolName}]`;
        })
        .join(" ");

      // Prepend tool call info to content
      assistantContent =
        toolCallInfo + (assistantContent ? "\n\n" + assistantContent : "");
    }

    // Save assistant message to IndexedDB
    const assistantMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      conversationId,
      role: "assistant",
      content: assistantContent,
      timestamp: new Date().toISOString(),
      metadata: {
        model: this.settings.aiModel,
        action,
        hasToolCalls: !!message?.tool_calls,
        toolCallCount: message?.tool_calls?.length || 0,
        toolNames: toolCallInfo,
        ...options.metadata,
      },
    };
    await saveMessage(assistantMessage);

    return {
      conversationId,
      content: assistantContent,
      model: this.settings.aiModel,
      timestamp: assistantMessage.timestamp,
      hasToolCalls: !!message?.tool_calls,
      toolCallCount: message?.tool_calls?.length || 0,
    };
  }

  async getConversationMessages(conversationId) {
    // Get messages from IndexedDB
    const messages = await getMessagesForConversation(conversationId, 1000);

    if (messages.length === 0) {
      // Fallback to old storage if no messages in IndexedDB
      const conversation = await readAiConversations();
      const conv = conversation.conversations[conversationId];

      if (conv && conv.messages && conv.messages.length > 0) {
        return conv.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));
      }

      // Return empty array - we'll add system context separately
      return [];
    }

    // Convert messages and ensure system context is at the beginning
    const messageList = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Always check for and add system context at the beginning
    const convData = await getConversation(conversationId);
    if (
      convData &&
      convData.url &&
      messageList.length > 0 &&
      messageList[0].role !== "system"
    ) {
      messageList.unshift({
        role: "system",
        content: `Page context from ${convData.url}`,
      });
    }

    return messageList;
  }
}

export function createAiProvider(settings) {
  return new AiProvider(settings);
}
