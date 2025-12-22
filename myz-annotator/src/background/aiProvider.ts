import { McpClient } from "./mcp.js";
import { readAiConversations } from "./ai.js";
import {
  saveMessage,
  getMessagesForConversation,
} from "../sidepanel/aiStorage.js";
import { parseAiRequestHeaders } from "@/shared/aiHeaderUtils.js";
import { syncAiRequestHeaderRules } from "./aiHeaders.js";
import { readState, sortedHighlights } from "./storage.js";
import { AIAssistantSettings, AIProviderSetting } from "./settings.js";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ContentBlock } from "./mcp_schema.js";
import { MyZRecord } from "@/shared/types.js";

const REASONING_TYPES = new Set([
  "reasoning",
  "reasoning_content",
  "analysis",
  "think",
  "thinking",
  "thought",
]);

export type Role = "user" | "assistant" | "tool" | "system";

export interface ToolInvocationDetails {
  id: string;
  name: string;
  arguments: string;
  response?: string;
}

export interface Conversation {
  conversationId: string;
  title: string;
  url: string;
  createdAt?: string;
  updatedAt?: string;
  sendContextEnabled?: boolean;
  messages: Message[];
}

export interface Message {
  id: string;
  conversationId?: string | null;
  role: Role;
  content: string;
  timestamp: string;
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  metadata?: {
    type?: string;
    hasToolCalls?: boolean;
    toolInvocationOnly?: boolean;
    toolCallDetails?: Array<ToolInvocationDetails>;
    [key: string]: any;
    toolNames?: string[] | string;
    toolCallCount?: number;
  };
}

export type ToolParamaterDefinition =
  | {
      type: "object";
      required?: string[];
      properties: Record<string, any>;
    }
  | {
      type: "number";
      minimum?: number;
      maximum?: number;
      default?: number;
      description?: string;
    }
  | {
      type: "string";
      description?: string;
    };

export interface ChatCompletionRequestPayload {
  model: string;
  messages: MessageInPayload[];
  max_tokens?: number;
  temperature?: number;
  tools?: { type: "function"; function: ToolDefinition }[];
  stream?: boolean;
}

export interface MessageInPayload {
  role: Role;
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParamaterDefinition;
}

export interface ToolCall {
  id: string;
  index?: number;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolExecutionResult {
  content: ContentBlock[];
  data?: any;
  isError?: boolean;
}

export interface ChatCompletionMessage {
  role: Role;
  content: string;
  reasoning_content?: string;
  reasoning?: string;
  tool_calls?: ToolCall[];
}

export interface ChatCompletionResponsePayload {
  choices: Array<{
    message?: ChatCompletionMessage;
    delta?: ChatCompletionMessage;
  }>;
}

export interface StreamCompletionOptions {
  onStreamDelta?: (delta: { content: string; reasoning: string }) => void;
}

export interface GenerateResponseOptions {
  stream?: boolean;
  onStreamDelta?: (delta: { content: string; reasoning: string }) => void;
  conversationId?: string | null;
  temperature?: number;
}

export interface ProcessConversationOptions {
  includePageContext?: boolean;
  metadata?: Record<string, any>;
  toolExecutionTimeoutMs?: number;
  stream?: boolean;
  streamId?: string;
}

export interface ContextChunk {
  id: string;
  order?: number;
  text: string;
  prefix: string;
}

export interface MessageStreamData {
  conversationId?: string;
  streamId: string | null;
  message?: Message;
  content?: string;
  delta?: string;
  reasoning?: string;
  metadata?: Record<string, any>;
  error?: string;
}

export interface MessageStream {
  id: string | null;
  content: string;
  timestamp: string;
  reasoning: string;
  metadata: Record<string, any>;
}

export interface ProcessConversationResult {
  conversationId: string;
  content: string;
  reasoning: string;
  model: string;
  timestamp: string;
  hasToolCalls: boolean;
  toolCallCount: number;
  availableTools?: Tool[];
}

export interface PageInsightPayload {
  action: string;
  chunks: ContextChunk[];
  title: string;
  url: string;
  temperature: number;
}

const LOCAL_TOOL_DEFINITIONS: Tool[] = [
  {
    name: "myz-list-hosts",
    description:
      "列出所有保存过的站点 host 以及对应的标注数量，按数量降序排序。",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "myz-popular-tags",
    description: "列出最常用的标签及其出现次数，按次数降序排序。",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 20,
          description: "返回的标签数量上限，默认 20。",
        },
      },
    },
  },
  {
    name: "myz-search-highlights",
    description:
      "按关键词搜索已保存的标注，匹配文本、笔记或标签，返回最近的匹配项。",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "要搜索的关键词。",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 10,
          description: "返回的匹配数量上限，默认 10。",
        },
      },
    },
  },
  {
    name: "myz-filter-by-date",
    description: "按日期范围筛选标注，返回最近的标注，日期格式 YYYY-MM-DD。",
    inputSchema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "开始日期（包含），格式 YYYY-MM-DD。",
        },
        to: {
          type: "string",
          description: "结束日期（包含），格式 YYYY-MM-DD。",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 20,
          description: "返回的标注数量上限，默认 20。",
        },
      },
    },
  },
  {
    name: "myz-filter-by-tag-or-host",
    description:
      "按标签或站点 host 筛选标注，可同时指定多个标签，返回最近的标注。",
    inputSchema: {
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: { type: "string" },
          description: "要匹配的标签列表，全部匹配才会返回。",
        },
        host: {
          type: "string",
          description: "要匹配的站点 host。",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 20,
          description: "返回的标注数量上限，默认 20。",
        },
      },
    },
  },
];

interface MessageContent {
  text?: string;
  reasoning?: string;
}

interface SplittedContent {
  text: string;
  reasoning: string;
}

function splitContentAndReasoning(
  content: MessageContent | string | undefined,
): SplittedContent {
  const result = { text: "", reasoning: "" };
  if (typeof content === "undefined" || content === null) {
    return result;
  }

  const append = (value: string | number, target: "text" | "reasoning") => {
    if (typeof value === "undefined" || value === null) return;
    result[target] += String(value);
  };

  const handlePart = (part: any) => {
    if (typeof part === "undefined" || part === null) return;
    if (typeof part === "string" || typeof part === "number") {
      append(part, "text");
      return;
    }

    if (Array.isArray(part)) {
      part.forEach(handlePart);
      return;
    }

    if (typeof part !== "object") {
      return;
    }

    const type = typeof part.type === "string" ? part.type.toLowerCase() : "";
    const textValue =
      typeof part.text === "string"
        ? part.text
        : typeof part.content === "string"
          ? part.content
          : "";
    const explicitReasoningText =
      typeof part.reasoning === "string"
        ? part.reasoning
        : typeof part.thought === "string"
          ? part.thought
          : "";
    const isReasoning =
      REASONING_TYPES.has(type) ||
      part.reasoning === true ||
      part.thought ||
      Boolean(explicitReasoningText);

    if (isReasoning && (textValue || explicitReasoningText)) {
      append(explicitReasoningText || textValue, "reasoning");
    } else if (textValue) {
      append(textValue, "text");
    }
  };

  handlePart(content);
  return result;
}

function normalizeReasoningChunk(value: MessageContent | string | undefined) {
  if (typeof value === "undefined" || value === null) return "";
  const { text, reasoning } = splitContentAndReasoning(value);
  return (reasoning || text || "").toString();
}

// fixme: any
function normalizeMessagePayload(message: any): {
  content: string;
  reasoning: string;
} {
  if (!message) {
    return { content: "", reasoning: "" };
  }

  const { text, reasoning } = splitContentAndReasoning(message.content);
  const reasoningCandidates = [
    message.reasoning_content,
    message.reasoning,
    message.analysis,
  ];
  const explicitReasoning =
    reasoningCandidates
      .map((item) => normalizeReasoningChunk(item).trim())
      .find((item) => item) || "";

  return {
    content:
      text ||
      (typeof message.content === "string"
        ? message.content
        : normalizeReasoningChunk(message.content)),
    reasoning: explicitReasoning || reasoning || "",
  };
}

export interface AIProviderOptions {
  allowUntested?: boolean;
}

export class AiProvider {
  private allowUntested: boolean;
  public provider: AIProviderSetting | null;
  public settings: Partial<AIAssistantSettings> & Partial<AIProviderSetting>;
  public isEnabled: boolean;
  private mcpClients: Map<string, McpClient>;

  constructor(
    settings: AIAssistantSettings,
    options: AIProviderOptions = { allowUntested: false },
  ) {
    this.allowUntested = Boolean(options.allowUntested);
    const { provider, fallbackSettings } = resolveActiveProvider(settings, {
      allowUntested: this.allowUntested,
    });
    this.provider = provider;
    this.settings = { ...fallbackSettings, ...(provider || {}) };
    this.mcpClients = new Map();
    this.isEnabled = Boolean(
      this.settings.aiAssistantEnabled &&
        this.provider &&
        (this.allowUntested || this.provider.lastTestStatus?.ok === true) &&
        (this.settings.apiEndpoint || this.settings.aiApiEndpoint) &&
        (this.settings.apiKey || this.settings.aiApiKey),
    );

    // Keep dynamic request header rules (e.g., custom User-Agent) in sync with the
    // provider being used, even before settings are persisted.
    this.syncRequestHeaderRules().catch((error) => {
      console.warn("Failed to sync AI header rules", error);
    });
  }

  buildRequestHeaders(): Record<string, string> {
    const customHeaders = parseAiRequestHeaders(
      this.settings.requestHeaders || this.settings.aiRequestHeaders,
    );
    const headerNamesLower = new Set(
      Object.keys(customHeaders).map((key) => key.toLowerCase()),
    );
    const headers: Record<string, string> = {};

    if (!headerNamesLower.has("content-type")) {
      headers["Content-Type"] = "application/json";
    }

    const apiKey = this.settings.apiKey || this.settings.aiApiKey;
    if (apiKey && !headerNamesLower.has("authorization")) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    return {
      ...headers,
      ...customHeaders,
    };
  }

  async syncRequestHeaderRules() {
    const providerId =
      this.provider?.id ||
      this.settings.aiActiveProviderId ||
      "active-provider";
    const apiEndpoint =
      this.provider?.apiEndpoint ||
      this.settings.apiEndpoint ||
      this.settings.aiApiEndpoint ||
      "";
    const requestHeaders =
      this.provider?.requestHeaders ||
      this.settings.requestHeaders ||
      this.settings.aiRequestHeaders ||
      "";

    const payload: AIAssistantSettings = {
      ...(this.settings as AIAssistantSettings),
      aiActiveProviderId: providerId,
      aiApiEndpoint: apiEndpoint,
      aiRequestHeaders: requestHeaders,
      aiProviders: [
        {
          ...this.provider!,
        },
      ],
    };

    try {
      await syncAiRequestHeaderRules(payload);
    } catch (error) {
      console.warn("Failed to update AI header rules", error);
    }
  }

  async testConnection() {
    const aiApiEndpoint =
      this.settings.apiEndpoint || this.settings.aiApiEndpoint;
    const aiApiKey = this.settings.apiKey || this.settings.aiApiKey;

    if (!this.settings.aiAssistantEnabled) {
      throw new Error("AI Assistant is not enabled or configured");
    }

    if (!aiApiEndpoint || !aiApiKey) {
      throw new Error("API endpoint or key not configured");
    }

    // Determine model to use (support custom models)
    let model = this.settings.model || this.settings.aiModel || "gpt-4";
    if (model === "custom" && this.settings.customModel) {
      model = this.settings.customModel;
    }

    try {
      const testPayload: ChatCompletionRequestPayload = {
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
        error: (error as Error).message,
      };
    }
  }

  async makeApiRequest(
    payload: ChatCompletionRequestPayload,
  ): Promise<ChatCompletionResponsePayload> {
    await this.syncRequestHeaderRules();
    const aiApiEndpoint =
      this.settings.apiEndpoint || this.settings.aiApiEndpoint;
    const aiApiKey = this.settings.apiKey || this.settings.aiApiKey;

    if (!aiApiEndpoint || !aiApiKey) {
      throw new Error("API endpoint or key not configured");
    }

    const response = await fetch(aiApiEndpoint, {
      method: "POST",
      headers: this.buildRequestHeaders(),
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

  async streamChatCompletion(
    payload: ChatCompletionRequestPayload,
    options: StreamCompletionOptions = {},
  ) {
    await this.syncRequestHeaderRules();
    const aiApiEndpoint =
      this.settings.apiEndpoint || this.settings.aiApiEndpoint;
    const aiApiKey = this.settings.apiKey || this.settings.aiApiKey;
    if (!aiApiEndpoint || !aiApiKey) {
      throw new Error("API endpoint or key not configured");
    }

    const response = await fetch(aiApiEndpoint, {
      method: "POST",
      headers: this.buildRequestHeaders(),
      body: JSON.stringify({
        ...payload,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!response.body || !contentType.includes("text/event-stream")) {
      // Fallback to regular JSON body
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error(
          `Failed to parse streaming response: ${(error as Error).message}`,
        );
      }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let done = false;
    let fullContent = "";
    let fullReasoning = "";
    const toolCalls: ToolCall[] = [];

    const ensureToolCallSlot = (index: number, partial: Partial<ToolCall>) => {
      if (!toolCalls[index]) {
        toolCalls[index] = {
          id: partial.id || `tool-${index + 1}`,
          type: "function",
          function: {
            name: partial.function?.name || "",
            arguments: "",
          },
        };
      }
      const target = toolCalls[index];
      if (partial.id) {
        target.id = partial.id;
      }
      if (partial.function?.name) {
        target.function.name = partial.function.name;
      }
      if (partial.function?.arguments) {
        target.function.arguments =
          (target.function.arguments || "") + partial.function.arguments;
      }
    };

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) {
        done = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const event of events) {
        const lines = event.split("\n");
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) {
            continue;
          }
          const dataStr = line.slice(5).trim();
          if (!dataStr || dataStr === "[DONE]") {
            done = dataStr === "[DONE]";
            continue;
          }
          let parsed: ChatCompletionResponsePayload;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            continue;
          }
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          const { text: deltaText, reasoning: reasoningFromContent } =
            splitContentAndReasoning(delta.content);
          const reasoningDeltaParts = [];
          if (reasoningFromContent) {
            reasoningDeltaParts.push(reasoningFromContent);
          }
          [delta.reasoning_content, delta.reasoning].forEach((field) => {
            const explicitReasoning = normalizeReasoningChunk(field);
            if (explicitReasoning) {
              reasoningDeltaParts.push(explicitReasoning);
            }
          });

          const reasoningDelta = reasoningDeltaParts.join("");
          let hasDeltaUpdate = false;

          if (deltaText) {
            fullContent += deltaText;
            hasDeltaUpdate = true;
          }

          if (reasoningDelta) {
            fullReasoning += reasoningDelta;
            hasDeltaUpdate = true;
          }

          if (hasDeltaUpdate) {
            options.onStreamDelta?.({
              content: fullContent,
              reasoning: fullReasoning,
            });
          }

          if (Array.isArray(delta.tool_calls)) {
            delta.tool_calls.forEach((callDelta, idx) => {
              const targetIndex =
                typeof callDelta.index === "number" ? callDelta.index : idx;
              ensureToolCallSlot(targetIndex, callDelta);
            });
          }
        }
        if (done) break;
      }
    }

    reader.releaseLock();

    const cleanedToolCalls: ToolCall[] = toolCalls
      .filter(Boolean)
      .map((call, index) => ({
        id: call.id || `tool-${index + 1}`,
        type: "function",
        function: {
          name: call.function?.name || "",
          arguments: call.function?.arguments || "",
        },
      }));

    const message: ChatCompletionMessage = {
      role: "assistant",
      content: fullContent,
    };

    if (fullReasoning.trim()) {
      message.reasoning_content = fullReasoning;
    }

    if (cleanedToolCalls.length > 0) {
      message.tool_calls = cleanedToolCalls;
    }

    return {
      choices: [{ message }],
    };
  }

  async generateResponse(
    messages: ChatCompletionMessage[],
    options: GenerateResponseOptions = {},
  ): Promise<ChatCompletionResponsePayload> {
    if (!this.isEnabled) {
      throw new Error("AI Assistant is not enabled");
    }

    const {
      stream = false,
      onStreamDelta,
      conversationId = null,
      ...restOptions
    }: GenerateResponseOptions = options;

    // Determine model to use (support custom models)
    let model = this.settings.model || this.settings.aiModel || "gpt-4";
    if (model === "custom" && this.settings.customModel) {
      model = this.settings.customModel;
    }

    // Determine max tokens based on context size setting
    const maxTokens = this.settings.aiMaxTokens || 32768;

    const payload: ChatCompletionRequestPayload = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature: restOptions.temperature ?? 0.7,
      ...restOptions,
    };

    // If MCP tools are available, include them in the request
    const mcpTools: Tool[] = await this.getAvailableTools();
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
          parameters: tool.inputSchema,
        } as ToolDefinition,
      }));
      console.log(
        "[MCP Debug] Added tools to payload:",
        payload.tools?.length,
        "tools",
      );
    } else {
      console.log("[MCP Debug] No MCP tools available");
    }

    const response: ChatCompletionResponsePayload = stream
      ? await this.streamChatCompletion(payload, {
          onStreamDelta,
        })
      : await this.makeApiRequest(payload);

    // Handle tool calls if present
    const message = response.choices?.[0]?.message;
    if (message?.tool_calls) {
      const toolCallDetails = message.tool_calls.map((call, index) => ({
        id: call.id || `tool-${index + 1}`,
        name: call.function?.name || "unknown",
        arguments: call.function?.arguments || "",
      }));
      const toolNames = toolCallDetails.map((detail) => detail.name);

      // Save tool call message first
      const toolCallMessage: Message = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        conversationId,
        role: "assistant" as Role,
        content: message.content || "", // Preserve content if present
        tool_calls: message.tool_calls,
        timestamp: new Date().toISOString(),
        metadata: {
          model: this.settings.aiModel,
          hasToolCalls: true,
          toolCallCount: message.tool_calls.length,
          toolNames,
          toolCallDetails,
        },
      };
      await saveMessage(toolCallMessage);

      // Notify UI immediately to show tool call
      this.notifyNewMessage(conversationId, toolCallMessage);

      // Then handle the tool calls
      // handleToolCalls returns the final AI response with tool results
      const finalResponse = await this.handleToolCalls(
        message,
        messages,
        conversationId,
        options, // Pass options so handleToolCalls can pass it to generateResponse
      );

      // Return the final response instead of the intermediate response
      return finalResponse;
    }

    return response;
  }

  async handleToolCalls(
    message: MessageInPayload,
    previousMessages: MessageInPayload[],
    conversationId: string | null,
    options: GenerateResponseOptions = {},
  ) {
    const toolCalls: ToolCall[] = message.tool_calls || [];
    const followUpMessages: MessageInPayload[] = [
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
        const toolResponseMessage: Message = {
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
        };
        await saveMessage(toolResponseMessage);

        // Notify UI immediately to show tool response
        this.notifyNewMessage(conversationId, toolResponseMessage);

        followUpMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: contentText,
        });
      } catch (error) {
        const errorText = `Error: ${(error as Error).message}`;

        // Save error to IndexedDB
        const toolErrorMessage: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          conversationId,
          role: "tool",
          content: errorText,
          tool_call_id: toolCall.id,
          timestamp: new Date().toISOString(),
          metadata: {
            toolName: toolCall.function?.name,
            toolArgs: toolCall.function?.arguments,
            error: (error as Error).message,
          },
        };
        await saveMessage(toolErrorMessage);

        // Notify UI immediately to show tool error
        this.notifyNewMessage(conversationId, toolErrorMessage);

        followUpMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: errorText,
        });
      }
    }

    return this.generateResponse(followUpMessages, options);
  }

  /**
   * Notify UI about new message via chrome.runtime messaging
   * This allows real-time updates for tool calls and responses
   */
  notifyNewMessage(conversationId: string | null, message: Message) {
    try {
      // Send message to all connected clients (including sidepanel)
      chrome.runtime
        .sendMessage({
          type: "myz:newMessage",
          data: {
            conversationId,
            message,
          },
        })
        .catch(() => {
          // Ignore errors - sidepanel might not be open
        });
    } catch (error) {
      console.warn("Failed to notify UI about new message:", error);
    }
  }

  notifyStreamStart(conversationId: string, message: Partial<Message>) {
    try {
      chrome.runtime
        .sendMessage({
          type: "myz:aiStreamStart",
          data: {
            conversationId,
            message,
          },
        })
        .catch(() => {});
    } catch (error) {
      console.warn("Failed to notify stream start:", error);
    }
  }

  notifyStreamDelta(conversationId: string, payload: MessageStreamData) {
    try {
      chrome.runtime
        .sendMessage({
          type: "myz:aiStreamChunk",
          data: {
            conversationId,
            ...payload,
          },
        })
        .catch(() => {});
    } catch (error) {
      console.warn("Failed to notify stream chunk:", error);
    }
  }

  notifyStreamComplete(conversationId: string, payload: MessageStreamData) {
    try {
      chrome.runtime
        .sendMessage({
          type: "myz:aiStreamComplete",
          data: {
            conversationId,
            ...payload,
          },
        })
        .catch(() => {});
    } catch (error) {
      console.warn("Failed to notify stream completion:", error);
    }
  }

  notifyStreamError(conversationId: string, payload: MessageStreamData) {
    try {
      chrome.runtime
        .sendMessage({
          type: "myz:aiStreamError",
          data: {
            conversationId,
            ...payload,
          },
        })
        .catch(() => {});
    } catch (error) {
      console.warn("Failed to notify stream error:", error);
    }
  }

  async executeToolCall(toolCall: ToolCall): Promise<ToolExecutionResult> {
    const { name, arguments: args } = toolCall.function;

    if (LOCAL_TOOL_HANDLERS[name]) {
      let parsedArgs = {};
      try {
        parsedArgs = args ? JSON.parse(args) : {};
      } catch {
        parsedArgs = {};
      }
      return LOCAL_TOOL_HANDLERS[name](parsedArgs);
    }

    // Find which MCP client has this tool
    for (const [_, client] of this.mcpClients) {
      const tools = client.getTools();
      if (tools.some((tool) => tool.name === name)) {
        try {
          const result = await client.callTool(name, JSON.parse(args));
          return {
            content: result.content,
            data: result.data,
            isError: result.isError,
          };
        } catch (error) {
          throw new Error(`Tool execution failed: ${(error as Error).message}`);
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
    const tools: Tool[] = [];

    tools.push(
      ...LOCAL_TOOL_DEFINITIONS.map((tool) => ({
        ...tool,
        server: "myz-local",
      })),
    );

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

  async disconnectMcpClients(): Promise<void> {
    for (const client of this.mcpClients.values()) {
      await client.disconnect();
    }
    this.mcpClients.clear();
  }

  async processConversation(
    conversationId: string,
    action: string,
    content: string,
    options: ProcessConversationOptions = {},
  ): Promise<ProcessConversationResult> {
    const {
      includePageContext = true,
      metadata = {},
      stream = false,
      ...llmOptions
    } = options;

    // Save user message to IndexedDB
    const userMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      conversationId,
      role: "user" as Role,
      content,
      timestamp: new Date().toISOString(),
      metadata: { action, ...metadata },
    };
    await saveMessage(userMessage);

    // Get conversation history from IndexedDB
    const history = await this.getConversationMessages(
      conversationId,
      includePageContext,
    );

    let streamMessageId: string | null = null;
    if (stream) {
      streamMessageId =
        llmOptions.streamId ||
        `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.notifyStreamStart(conversationId, {
        id: streamMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        metadata: {
          model: this.settings.aiModel,
          action,
          streaming: true,
        },
      });
    }

    // Generate AI response
    // IMPORTANT: Pass conversationId to generateResponse
    const response = await this.generateResponse(history, {
      ...llmOptions,
      conversationId, // Ensure conversationId is available when saving tool messages
      stream,
      onStreamDelta: stream
        ? (delta) => {
            if (!delta) return;
            const payload =
              typeof delta === "string"
                ? { delta }
                : {
                    delta: delta?.content ?? (delta as any)?.delta ?? "",
                    reasoning: delta?.reasoning ?? "",
                  };
            if (!payload.delta && !payload.reasoning) {
              return;
            }
            this.notifyStreamDelta(conversationId, {
              streamId: streamMessageId,
              ...payload,
            });
          }
        : undefined,
    }).catch((error) => {
      if (stream && streamMessageId) {
        this.notifyStreamError(conversationId, {
          streamId: streamMessageId,
          error: error.message,
        });
      }
      throw error;
    });

    // Check if response has both tool calls and content
    const message = response.choices?.[0]?.message;
    const { content: normalizedContent, reasoning: reasoningContent } =
      normalizeMessagePayload(message);
    let assistantContent = normalizedContent || "";
    let toolCallInfo = "";

    let toolNamesList: string[] = [];
    let toolCallDetails: ToolInvocationDetails[] = [];
    const assistantHadContent = Boolean((normalizedContent || "").trim());

    if (message?.tool_calls && message.tool_calls.length > 0) {
      toolNamesList = message.tool_calls.map(
        (call) => call.function?.name || "unknown",
      );
      toolCallDetails = message.tool_calls.map((call, index) => ({
        id: call.id || `tool-${index + 1}`,
        name: call.function?.name || "unknown",
        arguments: call.function?.arguments || "",
      }));
      // Build tool call information to show to user
      toolCallInfo = toolNamesList
        .map((toolName, i) => `[Tool ${i + 1}: ${toolName}]`)
        .join(" ");

      // Prepend tool call info to content
      assistantContent =
        toolCallInfo + (assistantContent ? "\n\n" + assistantContent : "");
    }

    // Save assistant message to IndexedDB
    const assistantMessage: Message = {
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
        toolNames: toolNamesList,
        toolCallDetails,
        toolInvocationOnly: !assistantHadContent && toolNamesList.length > 0,
        reasoning: reasoningContent || undefined,
        ...metadata,
      },
    };
    if (reasoningContent) {
      assistantMessage.reasoning_content = reasoningContent;
    }
    await saveMessage(assistantMessage);

    if (stream && streamMessageId) {
      this.notifyStreamComplete(conversationId, {
        streamId: streamMessageId,
        content: assistantContent,
        reasoning: reasoningContent || "",
        metadata: {
          toolNames: toolNamesList,
          toolCallDetails,
          reasoning: reasoningContent || "",
        },
        message: assistantMessage,
      });
    }

    return {
      conversationId,
      content: assistantContent,
      reasoning: reasoningContent || "",
      model: this.settings.aiModel!,
      timestamp: assistantMessage.timestamp,
      hasToolCalls: !!message?.tool_calls,
      toolCallCount: message?.tool_calls?.length || 0,
    };
  }

  async getConversationMessages(
    conversationId: string,
    includePageContext = true,
  ) {
    // Get messages from IndexedDB (which already includes system context from sidepanel)
    let messages = await getMessagesForConversation(conversationId, 1000);

    if (!includePageContext) {
      messages = messages.filter(
        (msg) => msg.metadata?.type !== "page_context" && msg.role !== "system",
      );
    }

    if (messages.length === 0) {
      // Fallback to old storage if no messages in IndexedDB
      const conversation = await readAiConversations();
      const conv = conversation.conversations[conversationId];

      if (conv && conv.messages && conv.messages.length > 0) {
        const legacyMessages = includePageContext
          ? conv.messages
          : conv.messages.filter((msg) => msg.role !== "system");
        return legacyMessages.map((msg) => this.transformMessageForModel(msg));
      }
    }

    // Return messages as-is - sidepanel already adds system context when creating conversation
    // No need to add system context here to avoid duplication
    // IMPORTANT: Must include tool_call_id for tool messages
    return messages.map((msg) => this.transformMessageForModel(msg));
  }

  transformMessageForModel(message: Message): MessageInPayload {
    if (!message) {
      return { role: "system", content: "" };
    }

    const formatted: MessageInPayload = {
      role: message.role,
      content: message.content,
    };

    // Include tool_call_id for tool messages (required by LLM API)
    if (message.role === "tool" && message.tool_call_id) {
      formatted.tool_call_id = message.tool_call_id;
    }

    // Include tool_calls for assistant messages with tools
    if (message.role === "assistant" && message.tool_calls) {
      formatted.tool_calls = message.tool_calls;
    }

    return formatted;
  }

  buildInsightsPrompt(action: string, { totalGroups = 1 } = {}): string {
    const actionLabel =
      action === "key_points" ? "发现关键要点" : "总结页面内容";
    const multiPartHint =
      totalGroups > 1
        ? `你会在多批（共 ${totalGroups} 批）中收到片段。编号必须跨批延续，并保持 MECE。`
        : "所有片段一次提供，请按照金字塔结构（结论在前，层级清晰）组织。";
    return [
      "请使用中文回答，并以 Markdown 呈现网页的结构化总结。",
      multiPartHint,
      "要求：",
      "1. 使用 Markdown 清晰准确地总结内容，确保信息完整且无歧义。",
      "2. 按照金字塔原理，顶层先给全局结论，再给分层要点，结论准确，层级清晰。各层级须符合MECE准则。",
      '3. 涉及到对于原文引用的信息，请使用 `[摘要内容](myz-chunk://{CHUNK_ID} "{原文文本前缀}")` 的形式引用，旨在生成链接以方便用户定位原文。其中 `myz-chunk://` 协议部分是必需内容，`{CHUNK_ID}` 为对应引文的CHUNK ID，`{原文文本前缀}` 最长80字符，必须与原文一致。',
      "4. 所有关键要点必须给出原文引用。",
      `5. 当前任务：${actionLabel}。`,
      "6. 当且仅当所有内容完全输出完毕时，以 [[END]] 结尾；若尚未完成，请不要输出该终止符。",
      `
生成摘要的方式如下：
对于原文：

CHUNK 1: myz-chunk-miy0603t-000
正文:
古典自由主义（英语：classical liberalism）是一种支持个人先于国家存在的政治哲学，强调个人的权利、私有财产，并主张自由放任的经济政策，认为政府存在的目的仅在于保护每个个体的自由。古典自由主义发源于17世纪和18世纪，通常被视为由于工业革命和随后的资本主义体制而产生的一种意识形态。言论自由、信仰自由、思想自由和自由市场等概念最先也是由古典自由主义所提出，后来才陆续被其他政治意识形态所采纳。古典自由主义反对当时绝大多数较早期的政治学说，例如君权神授说、世袭制度和国教制度，强调个人的自由、理性、正义和宽容。美国革命和法国大革命都受到古典自由主义的影响。

生成的摘要可以是：

[古典自由主义](myz-chunk://myz-chunk-miy0603t-000 "古典自由主义（英语：classical liberalism）是一种支持个人先于国家存在的政治哲学")是一种[源于17至18世纪](myz-chunk://myz-chunk-miy0603t-000 "古典自由主义发源于17世纪和18世纪")、强调个人权利、私有财产和自由市场，并主张政府仅限于保护个体自由的政治哲学，[对美国和法国大革命产生了重要影响](myz-chunk://myz-chunk-miy0603t-000 "美国革命和法国大革命都受到古典自由主义的影响")。
`,
    ].join("\n");
  }

  normalizeInsightChunks(
    chunks: Partial<ContextChunk>[] = [],
    maxChunks = Infinity,
  ): ContextChunk[] {
    if (!Array.isArray(chunks)) {
      return [];
    }
    const filtered = chunks.filter(
      (chunk) =>
        chunk &&
        typeof chunk.id !== "undefined" &&
        typeof chunk.text === "string" &&
        chunk.text.trim(),
    );
    const limit = Number.isFinite(maxChunks) ? maxChunks : filtered.length;
    return filtered.slice(0, Math.max(1, limit)).map((chunk, index) => {
      const safeText =
        typeof chunk.text === "string" ? chunk.text : String(chunk.text || "");
      const prefix = (chunk.prefix || safeText.slice(0, 160)).replace(
        /\s+/g,
        " ",
      );
      return {
        id: String(chunk.id),
        order: index,
        text: safeText,
        prefix: prefix.trim(),
      };
    });
  }

  splitChunksIntoGroups(
    chunks: ContextChunk[],
    perGroup = 20,
    maxCharsPerGroup = Infinity,
  ) {
    if (!Array.isArray(chunks) || !chunks.length) {
      return [];
    }
    const limitCount = Math.max(1, Number(perGroup) || 20);
    const groups: ContextChunk[][] = [];
    let current: ContextChunk[] = [];
    let currentChars = 0;

    const flush = () => {
      if (!current.length) {
        return;
      }
      groups.push(current);
      current = [];
      currentChars = 0;
    };

    chunks.forEach((chunk) => {
      const text = typeof chunk.text === "string" ? chunk.text : "";
      const chunkChars = text.length;
      if (
        current.length &&
        (current.length >= limitCount ||
          currentChars + chunkChars > maxCharsPerGroup)
      ) {
        flush();
      }
      current.push(chunk);
      currentChars += chunkChars;
    });

    flush();
    return groups;
  }

  async generatePageInsights(payload: Partial<PageInsightPayload> = {}) {
    if (!this.isEnabled) {
      throw new Error("AI Assistant is not enabled");
    }
    const action = payload.action === "key_points" ? "key_points" : "summarize";
    const chunks = this.normalizeInsightChunks(payload.chunks || [], Infinity);
    if (!chunks.length) {
      throw new Error("No page context available to summarize");
    }

    const maxTokens = this.settings.aiMaxTokens || 32768;
    const approximateCharsPerToken = 4;
    const targetCharsPerBatch = Math.min(
      80000,
      Math.max(4000, Math.floor((maxTokens / 2) * approximateCharsPerToken)),
    );
    const chunkGroups = [
      ...this.splitChunksIntoGroups(chunks, chunks.length, targetCharsPerBatch),
    ];

    const baseMessages: MessageInPayload[] = [
      {
        role: "system",
        content: this.buildInsightsPrompt(action, {
          totalGroups: chunkGroups.length,
        }),
      },
      {
        role: "user",
        content: [
          `页面标题: ${payload.title || "未命名页面"}`,
          `URL: ${payload.url || ""}`,
          `任务: ${action === "key_points" ? "提取关键要点" : "总结页面内容"}`,
          "请一次性阅读以下全部片段，按照指引输出 Markdown，并在全部完成后以 [[END]] 结尾。",
        ].join("\n"),
      },
    ];

    let chunkCounter = 0;
    chunkGroups.forEach((group) => {
      group.forEach((chunk) => {
        baseMessages.push({
          role: "user",
          content: [
            `CHUNK ${chunkCounter + 1}: ${chunk.id}`,
            "正文:",
            chunk.text,
          ].join("\n"),
        });
        chunkCounter += 1;
      });
    });

    const conversationMessages: MessageInPayload[] = [...baseMessages];
    const markdownParts = [];
    const rawResponses = [];
    let numberingHint = 0;
    let attempts = 0;
    const maxAttempts = 6;

    let model = this.settings.aiModel || "gpt-4";
    if (model === "custom" && this.settings.aiCustomModel) {
      model = this.settings.aiCustomModel;
    }

    while (attempts < maxAttempts) {
      const response = await this.makeApiRequest({
        model: model,
        messages: conversationMessages,
        max_tokens: maxTokens,
        temperature: payload.temperature ?? 0.2,
      });

      const normalizedResponse = normalizeMessagePayload(
        response.choices?.[0]?.message,
      );
      let content = (normalizedResponse.content || "").trim();
      const done = content.endsWith("[[END]]");
      if (done) {
        content = content.slice(0, -5).trimEnd();
      }
      if (content) {
        markdownParts.push(content);
        numberingHint += (content.match(/\d+\s*[\.)]/g) || []).length;
      }
      rawResponses.push(content);

      if (done) {
        break;
      }

      if (content) {
        conversationMessages.push({ role: "assistant", content });
      }
      conversationMessages.push({
        role: "user",
        content:
          "请继续尚未输出的内容，延续上一条的编号，并在全部完成后以 [[END]] 结尾。",
      });
      attempts += 1;
    }

    return {
      success: true,
      action,
      markdown: markdownParts.join("\n\n").trim(),
      raw: rawResponses,
      chunkGroups: chunkGroups.length,
      generatedAt: new Date().toISOString(),
    };
  }
}

export function createAiProvider(
  settings: AIAssistantSettings,
  options: AIProviderOptions = {},
) {
  return new AiProvider(settings, options);
}

function toDateOnly(value: any): Date | null {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

async function readAllHighlights() {
  const state = await readState();
  return sortedHighlights(state);
}

function normalizeLimit(value: any, fallback = 20, max = 50): number {
  if (typeof value !== "number") return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function buildHighlightSummary(record: MyZRecord): string {
  if (!record) return "";
  const date =
    typeof record.createdAt === "string"
      ? record.createdAt.slice(0, 10)
      : new Date(record.createdAt || Date.now()).toISOString().slice(0, 10);
  const host = record.hostname || record.host || "";
  const tags = Array.isArray(record.tags) ? record.tags.join(", ") : "";
  const text = (record.text || "").replace(/\s+/g, " ").slice(0, 140);
  const note = (record.note || "").replace(/\s+/g, " ").slice(0, 100);
  const parts = [`[${date}]`, host || "unknown"];
  if (tags) parts.push(`tags: ${tags}`);
  if (text) parts.push(`“${text}”`);
  if (note) parts.push(`note: ${note}`);
  return parts.join(" · ");
}

const LOCAL_TOOL_HANDLERS: Record<
  string,
  (args?: any) => Promise<ToolExecutionResult>
> = {
  "myz-list-hosts": async () => {
    const highlights = await readAllHighlights();
    const counts = new Map();
    highlights.forEach((h) => {
      const host = h.hostname || h.host || "";
      if (!host) return;
      counts.set(host, (counts.get(host) || 0) + 1);
    });
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([host, count]) => ({ host, count }));
    const lines = sorted.map((item) => `${item.host}: ${item.count}`);
    const text =
      sorted.length > 0
        ? `共 ${sorted.length} 个站点：\n${lines.join("\n")}`
        : "没有找到保存的站点。";
    return { content: [{ type: "text", text }], data: sorted };
  },
  "myz-popular-tags": async (args = {}) => {
    const limit = normalizeLimit(args.limit, 20, 50);
    const highlights = await readAllHighlights();
    const counts = new Map();
    highlights.forEach((h) => {
      (Array.isArray(h.tags) ? h.tags : []).forEach((tag) => {
        if (typeof tag !== "string" || !tag.trim()) return;
        const key = tag.trim();
        counts.set(key, (counts.get(key) || 0) + 1);
      });
    });
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
    const lines = sorted.map((item) => `${item.tag}: ${item.count}`);
    const text =
      sorted.length > 0
        ? `热门标签（前 ${sorted.length}）：\n${lines.join("\n")}`
        : "没有找到标签。";
    return { content: [{ type: "text", text }], data: sorted };
  },
  "myz-search-highlights": async (args = {}) => {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    const limit = normalizeLimit(args.limit, 10, 50);
    if (!query) {
      return {
        content: [{ type: "text", text: "请输入要搜索的关键词。" }],
        data: [],
      };
    }
    const needle = query.toLowerCase();
    const highlights = await readAllHighlights();
    const matches = highlights
      .filter((h) => {
        const haystack = [
          h.text || "",
          h.note || "",
          (Array.isArray(h.tags) ? h.tags.join(" ") : "") || "",
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, limit);
    const text =
      matches.length > 0
        ? `找到 ${matches.length} 条匹配：\n${matches
            .map((m) => `- ${buildHighlightSummary(m)}`)
            .join("\n")}`
        : "未找到匹配的标注。";
    return { content: [{ type: "text", text }], data: matches };
  },
  "myz-filter-by-date": async (args = {}) => {
    const fromDate = toDateOnly(args.from);
    const toDate = toDateOnly(args.to);
    const limit = normalizeLimit(args.limit, 20, 50);
    const highlights = await readAllHighlights();
    const matches = highlights
      .filter((h) => {
        const date = toDateOnly(h.createdAt || h.created_at || h.date);
        if (!date) return false;
        if (fromDate && date < fromDate) return false;
        if (toDate && date > toDate) return false;
        return true;
      })
      .slice(0, limit);
    const text =
      matches.length > 0
        ? `筛选到 ${matches.length} 条标注：\n${matches
            .map((m) => `- ${buildHighlightSummary(m)}`)
            .join("\n")}`
        : "未找到符合日期范围的标注。";
    return { content: [{ type: "text", text }], data: matches };
  },
  "myz-filter-by-tag-or-host": async (
    args: { tags?: string[]; host?: string; limit?: number } = { tags: [] },
  ) => {
    const limit = normalizeLimit(args.limit, 20, 50);
    const tags = Array.isArray(args.tags)
      ? args.tags
          .filter((t) => typeof t === "string" && t.trim())
          .map((t) => t.trim().toLowerCase())
      : [];
    const host =
      typeof args.host === "string" && args.host.trim()
        ? args.host.trim().toLowerCase()
        : "";
    const highlights = await readAllHighlights();
    const matches = highlights
      .filter((h) => {
        if (host) {
          const currentHost = (h.hostname || h.host || "").toLowerCase();
          if (!currentHost.includes(host)) return false;
        }
        if (tags.length) {
          const itemTags = Array.isArray(h.tags)
            ? h.tags.map((t) => String(t).toLowerCase())
            : [];
          return tags.every((tag) => itemTags.includes(tag));
        }
        return true;
      })
      .slice(0, limit);
    const summaryParts = [];
    if (host) summaryParts.push(`host 包含 "${host}"`);
    if (tags.length) summaryParts.push(`标签包含 ${tags.join(", ")}`);
    const summaryText = summaryParts.length
      ? summaryParts.join(" 且 ")
      : "所有标注";
    const text =
      matches.length > 0
        ? `${summaryText}，返回 ${matches.length} 条：\n${matches
            .map((m) => `- ${buildHighlightSummary(m)}`)
            .join("\n")}`
        : `未找到满足条件的标注（${summaryText}）。`;
    return { content: [{ type: "text", text }], data: matches };
  },
};

function resolveActiveProvider(
  settings: Partial<AIAssistantSettings> = {},
  options: { allowUntested?: boolean } = {},
): {
  provider: AIProviderSetting | null;
  fallbackSettings: Partial<AIAssistantSettings> & Partial<AIProviderSetting>;
} {
  const allowUntested = Boolean(options.allowUntested);
  const providers = Array.isArray(settings.aiProviders)
    ? settings.aiProviders
    : [];
  const eligibleProviders = providers.filter((p) => p && typeof p === "object");
  const hasProviders = eligibleProviders.length > 0;
  let provider: AIProviderSetting | null = null;

  if (allowUntested) {
    provider =
      eligibleProviders.find((p) => p.id === settings.aiActiveProviderId) ||
      eligibleProviders[0] ||
      null;
  } else {
    provider =
      eligibleProviders.find(
        (p) => p.id === settings.aiActiveProviderId && p.lastTestStatus?.ok,
      ) || null;
    if (!provider && eligibleProviders.length) {
      provider = eligibleProviders.find((p) => p.lastTestStatus?.ok) || null;
    }
  }

  if (
    !provider &&
    !hasProviders &&
    (settings.aiApiEndpoint || settings.aiApiKey || settings.aiModel)
  ) {
    provider = {
      id: "provider-default",
      name: "默认 Provider",
      apiEndpoint: settings.aiApiEndpoint!,
      apiKey: settings.aiApiKey!,
      model: settings.aiModel || "gpt-4",
      customModel: settings.aiCustomModel || "",
      contextSize: settings.aiContextSize || "32K",
      maxTokens:
        typeof settings.aiMaxTokens === "number" ? settings.aiMaxTokens : 32768,
      requestHeaders: settings.aiRequestHeaders || "",
      lastTestStatus: { ok: true, message: "legacy" },
    };
  }

  const fallbackSettings: Partial<AIAssistantSettings> &
    Partial<AIProviderSetting> = {
    ...settings,
  };
  if (provider) {
    fallbackSettings.aiActiveProviderId =
      settings.aiActiveProviderId || provider.id;
    fallbackSettings.aiApiEndpoint = provider.apiEndpoint || "";
    fallbackSettings.aiApiKey = provider.apiKey || "";
    fallbackSettings.aiModel = provider.model || "gpt-4";
    fallbackSettings.aiCustomModel = provider.customModel || "";
    fallbackSettings.aiContextSize = provider.contextSize || "32K";
    fallbackSettings.aiMaxTokens =
      typeof provider.maxTokens === "number" ? provider.maxTokens : 32768;
    fallbackSettings.aiRequestHeaders = provider.requestHeaders || "";
    fallbackSettings.apiEndpoint = provider.apiEndpoint || "";
    fallbackSettings.apiKey = provider.apiKey || "";
    fallbackSettings.model = provider.model || "gpt-4";
    fallbackSettings.customModel = provider.customModel || "";
    fallbackSettings.contextSize = provider.contextSize || "32K";
    fallbackSettings.maxTokens =
      typeof provider.maxTokens === "number" ? provider.maxTokens : 32768;
    fallbackSettings.requestHeaders = provider.requestHeaders || "";
  }

  return { provider, fallbackSettings };
}
