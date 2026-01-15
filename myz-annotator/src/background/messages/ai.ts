import {
  createConversation,
  exportConversation,
  getConversationHistory,
  listConversations,
  readAiConversations,
  saveAiGeneratedHighlight,
  writeAiConversations,
} from "../ai";
import type {
  ImageAttachment,
  PageInsightPayload,
  ProcessConversationOptions,
} from "../ai/types.js";
import { testMcpConnection } from "../mcp";
import type {
  AIProviderSetting,
  MaxOutputTokenParam,
  McpServerSetting,
} from "../settings";
import { generateId, readSettings, saveHighlight } from "../storage";
import { registerMessageHandler } from "./handler";
import { MyZRecord, RECORD_KINDS } from "@/shared/types";
import { deleteConversation } from "@/sidepanel/aiStorage";
import { resolveAgentTarget, resolveModelRef } from "../ai/runtime/agentSelection.js";
import { acquireProviderRuntime } from "../ai/runtime/providerRuntime.js";
import {
  buildModelsUrl,
  buildProviderHeaders,
  buildChatCompletionsUrl,
  extractOpenAICompatibleModels,
} from "../ai/runtime/openaiCompatible.js";
import { McpCapability } from "../ai/capabilities/mcp.js";
import { ConversationAgent } from "../ai/agents/conversationAgent.js";
import { InsightsAgent } from "../ai/agents/insightsAgent.js";
import { ToolSelectionAgent } from "../ai/agents/toolSelectionAgent.js";
import { LOCAL_TOOL_NAMES } from "../ai/tools/localDefinitions.js";

/**
 * Stores a "draft action" so the SidePanel can pick it up even if the runtime
 * message fires before the SidePanel page is ready.
 */
const PENDING_SIDEPANEL_ACTION_KEY = "myz::pendingSidePanelAction";

function generateDraftId(prefix = "draft") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Prefer session storage to avoid persistence beyond the current browser session.
 * Fall back to local storage if `chrome.storage.session` is unavailable.
 */
async function writePendingSidePanelAction(payload: any) {
  try {
    await chrome.storage.session.set({ [PENDING_SIDEPANEL_ACTION_KEY]: payload });
  } catch {
    await chrome.storage.local.set({ [PENDING_SIDEPANEL_ACTION_KEY]: payload });
  }
}

/**
 * Returns and clears the pending draft action.
 */
async function popPendingSidePanelAction() {
  try {
    const result = await chrome.storage.session.get(PENDING_SIDEPANEL_ACTION_KEY);
    await chrome.storage.session.remove(PENDING_SIDEPANEL_ACTION_KEY);
    return result?.[PENDING_SIDEPANEL_ACTION_KEY] || null;
  } catch {
    const result = await chrome.storage.local.get(PENDING_SIDEPANEL_ACTION_KEY);
    await chrome.storage.local.remove(PENDING_SIDEPANEL_ACTION_KEY);
    return result?.[PENDING_SIDEPANEL_ACTION_KEY] || null;
  }
}

/**
 * Clears the pending draft action only if the `draftId` matches (prevents
 * wiping a newer action if the SidePanel is already open).
 */
async function clearPendingSidePanelActionIfMatch(draftId: string) {
  if (!draftId) return;
  const read = async (area: "session" | "local") => {
    const store = area === "session" ? chrome.storage.session : chrome.storage.local;
    const result = await store.get(PENDING_SIDEPANEL_ACTION_KEY);
    const current = result?.[PENDING_SIDEPANEL_ACTION_KEY];
    if (current?.draftId && current.draftId === draftId) {
      await store.remove(PENDING_SIDEPANEL_ACTION_KEY);
      return true;
    }
    return false;
  };
  try {
    if (await read("session")) return;
  } catch {}
  try {
    await read("local");
  } catch {}
}

export function initializeAIMessageHandlers() {
  // AI Assistant handlers
  registerMessageHandler(
    "myz:aiProviderFetchModels",
    async (payload: { baseUrl: string; apiKey: string; headers?: string }) => {
      const { baseUrl, apiKey, headers = "" } = payload || ({} as any);
      const url = buildModelsUrl(baseUrl);
      if (!url) {
        throw new Error("Base URL is required");
      }
      const response = await fetch(url, {
        method: "GET",
        headers: buildProviderHeaders(apiKey, headers),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Fetch models failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }
      const data = await response.json();
      return { models: extractOpenAICompatibleModels(data) };
    },
  );

  registerMessageHandler(
    "myz:aiProviderTestConnection",
    async (payload: {
      provider: Pick<AIProviderSetting, "baseUrl" | "apiKey" | "headers">;
      model: string;
      maxOutputTokens?: number;
      maxOutputTokenParam?: MaxOutputTokenParam;
    }) => {
      const provider = payload?.provider;
      const model = typeof payload?.model === "string" ? payload.model.trim() : "";
      if (!provider?.baseUrl) {
        throw new Error("Base URL is required");
      }
      if (!provider?.apiKey) {
        throw new Error("API key is required");
      }
      if (!model) {
        throw new Error("Model is required");
      }

      const endpoint = buildChatCompletionsUrl(provider.baseUrl);
      const maxOutputTokens =
        typeof payload?.maxOutputTokens === "number" && payload.maxOutputTokens > 0
          ? Math.floor(payload.maxOutputTokens)
          : 64;
      const maxOutputTokenParam: MaxOutputTokenParam =
        payload?.maxOutputTokenParam === "max_completion_tokens"
          ? "max_completion_tokens"
          : "max_tokens";

      const request: any = {
        model,
        messages: [
          {
            role: "user",
            content:
              "Please respond with 'Connection successful' to confirm the API is working.",
          },
        ],
        temperature: 0.0,
      };
      if (maxOutputTokenParam === "max_completion_tokens") {
        request.max_completion_tokens = maxOutputTokens;
      } else {
        request.max_tokens = maxOutputTokens;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: buildProviderHeaders(provider.apiKey, provider.headers || ""),
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `API request failed: ${response.status} ${response.statusText} - ${errorText}`,
        };
      }
      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || "";
      return { success: true, response: text };
    },
  );

  registerMessageHandler(
    "myz:aiStreamRequest",
    async (payload: {
      conversationId: string;
      message?: string;
      action?: string;
      attachments?: ImageAttachment[];
      context?: {
        url?: string;
        title?: string;
        includePageContext?: boolean;
      };
      options?: Partial<ProcessConversationOptions>;
    }) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }

      const { conversationId, message, action, context, options, attachments } =
        payload || ({} as any);
      if (!conversationId) {
        throw new Error("conversationId is required");
      }
      const normalizedMessage = typeof message === "string" ? message : "";
      const normalizedAttachments = Array.isArray(attachments)
        ? attachments.filter(
            (item: any) =>
              item?.type === "image" && typeof item?.dataUrl === "string" && item.dataUrl,
          )
        : [];
      if (!normalizedMessage.trim() && !normalizedAttachments.length) {
        throw new Error("message is required");
      }

      const target = resolveAgentTarget(settings as any, "conversation");
      const runtime = await acquireProviderRuntime(
        target.provider as any,
        (settings.aiMcpServers || []) as any,
      );

      try {
        const enableTools = Boolean(target.model.capabilities.toolCalling);
        if (enableTools) {
          await runtime.connectMcp();
        }

        const aiLocalTools = (settings as any)?.aiLocalTools
        if (enableTools) {
          const enabledToolNames = Array.isArray((settings as any)?.aiLocalTools?.enabledToolNames)
            ? ((settings as any).aiLocalTools.enabledToolNames as any[])
                .filter((name: any) => typeof name === "string" && name.trim())
                .map((name: string) => name.trim())
            : LOCAL_TOOL_NAMES.slice()
          const normalizedToolNames =
            aiLocalTools?.mode === "auto"
              ? (() => {
                  if (!enabledToolNames.includes("myz-select-tools")) {
                    enabledToolNames.push("myz-select-tools")
                  }
                  return enabledToolNames
                })()
              : enabledToolNames.filter((name: string) => name !== "myz-select-tools")
          runtime.session.mcp.setLocalToolAllowlist(normalizedToolNames)
        }

        const includePageContext =
          typeof context?.includePageContext === "boolean"
            ? context?.includePageContext
            : undefined;

        const agent = new ConversationAgent();
        const client = enableTools
          ? runtime.session.clientWithTools
          : runtime.session.client;

        const toolSelectorTarget = aiLocalTools?.autoSelectorTarget
        const toolSelectorRequested = enableTools && aiLocalTools?.mode === "auto"

        return await agent.processConversation(
          conversationId,
          action || "custom",
          normalizedMessage,
          {
            ...(options || {}),
            includePageContext:
              includePageContext ?? options?.includePageContext ?? true,
            attachments: normalizedAttachments,
            stream: true,
            metadata: {
              ...(options?.metadata || {}),
              ...(context?.url ? { url: context.url } : {}),
              ...(context?.title ? { title: context.title } : {}),
              source: "sidepanel",
            },
          },
          {
            client: client as any,
            isEnabled: Boolean(settings.aiAssistantEnabled),
            callConfig: target as any,
            ...(enableTools
              ? {
                  toolControl: {
                    listTools: () =>
                      (runtime.session.mcp.listTools() as any[]).map((tool: any) => ({
                        name: tool?.name || "",
                        description: tool?.description || "",
                        server: tool?.server || "",
                      })),
                    setActiveToolFilter: (toolNames: string[] | null) =>
                      runtime.session.mcp.setActiveToolFilter(toolNames),
                  },
                }
              : {}),
            ...(toolSelectorRequested
              ? {
                  toolSelector: {
                    enabled: true,
                    selectToolNames: async (
                      prompt: string,
                      tools: Array<{ name: string; description?: string; server?: string }>,
                    ) => {
                      const normalizedPrompt =
                        typeof prompt === "string" ? prompt.trim() : ""
                      const candidates = Array.isArray(tools)
                        ? tools.filter((t) => t?.name)
                        : []
                      if (!normalizedPrompt || candidates.length === 0) {
                        return []
                      }

                      if (!toolSelectorTarget?.providerId || !toolSelectorTarget?.modelId) {
                        return []
                      }

                      try {
                        const resolved = resolveModelRef(settings as any, toolSelectorTarget)
                        const selectorRuntime = await acquireProviderRuntime(
                          resolved.provider as any,
                          [],
                        )
                        try {
                          const selector = new ToolSelectionAgent()
                          return await selector.selectToolNames({
                            prompt: normalizedPrompt,
                            tools: candidates,
                            client: selectorRuntime.session.client as any,
                            model: resolved.model as any,
                          })
                        } finally {
                          await selectorRuntime.release()
                        }
                      } catch (error) {
                        console.warn("Tool selector failed", error)
                        return []
                      }
                    },
                  },
                }
              : {}),
          },
        );
      } finally {
        try {
          runtime.session.mcp.setActiveToolFilter(null)
        } catch {}
        if (target.model.capabilities.toolCalling) {
          await runtime.disconnectMcp();
        }
        await runtime.release();
      }
    },
  );

  registerMessageHandler(
    "myz:openSidePanelDraft",
    async (
      payload: {
        action: "interpret_selection";
        prompt?: string;
        selectionText?: string;
        selectionAttachment?: ImageAttachment | null;
        draftId?: string;
      },
      sender: chrome.runtime.MessageSender,
    ) => {
      const tabId = sender?.tab?.id;
      const windowId = sender?.tab?.windowId;
      try {
        if (typeof tabId === "number") {
          await chrome.sidePanel.open({ tabId });
        } else if (typeof windowId === "number") {
          await chrome.sidePanel.open({ windowId });
        }
      } catch (error) {
        console.warn("Failed to open sidepanel", error);
      }

      const draftPayload = {
        action: payload?.action,
        prompt: payload?.prompt,
        selectionText: payload?.selectionText,
        selectionAttachment: payload?.selectionAttachment || null,
        tabId,
        draftId: payload?.draftId || generateDraftId(),
      };

      await writePendingSidePanelAction(draftPayload);

      try {
        await chrome.runtime.sendMessage({
          type: "myz:openSidePanelWithAction",
          payload: draftPayload,
        });
      } catch (error) {
        console.warn("Forward sidepanel draft failed", error);
      }

      return { ok: true };
    },
  );

  registerMessageHandler("myz:popSidePanelAction", async () => {
    return popPendingSidePanelAction();
  });

  registerMessageHandler(
    "myz:ackSidePanelAction",
    async (payload: { draftId?: string }) => {
      const draftId =
        typeof payload?.draftId === "string" ? payload.draftId.trim() : "";
      await clearPendingSidePanelActionIfMatch(draftId);
      return { ok: true };
    },
  );

  registerMessageHandler(
    "myz:createConversation",
    async (payload: { url: string; title: string }) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }

      const { url, title } = payload || {};
      const conversation = createConversation(url, title);

      // Store conversation
      const state = await readAiConversations();
      state.conversations[conversation.id] = conversation;
      state.activeConversationId = conversation.id;
      await writeAiConversations(state);

      return conversation;
    },
  );

  registerMessageHandler(
    "myz:processWithAi",
    async (payload: {
      conversationId: string;
      action: string;
      content: string;
      options?: Partial<ProcessConversationOptions>;
    }) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }

      const target = resolveAgentTarget(settings as any, "conversation");
      const runtime = await acquireProviderRuntime(
        target.provider as any,
        (settings.aiMcpServers || []) as any,
      );

      try {
        const enableTools = Boolean(target.model.capabilities.toolCalling);
        if (enableTools) {
          await runtime.connectMcp();
        }
        const { conversationId, action, content, options = {} } = payload || {};

        const aiLocalTools = (settings as any)?.aiLocalTools
        if (enableTools) {
          const enabledToolNames = Array.isArray((settings as any)?.aiLocalTools?.enabledToolNames)
            ? ((settings as any).aiLocalTools.enabledToolNames as any[])
                .filter((name: any) => typeof name === "string" && name.trim())
                .map((name: string) => name.trim())
            : LOCAL_TOOL_NAMES.slice()
          const normalizedToolNames =
            aiLocalTools?.mode === "auto"
              ? (() => {
                  if (!enabledToolNames.includes("myz-select-tools")) {
                    enabledToolNames.push("myz-select-tools")
                  }
                  return enabledToolNames
                })()
              : enabledToolNames.filter((name: string) => name !== "myz-select-tools")
          runtime.session.mcp.setLocalToolAllowlist(normalizedToolNames)
        }

        const agent = new ConversationAgent();
        const client = enableTools
          ? runtime.session.clientWithTools
          : runtime.session.client;
        const toolSelectorTarget = aiLocalTools?.autoSelectorTarget
        const toolSelectorRequested = enableTools && aiLocalTools?.mode === "auto"
        const result = await agent.processConversation(
          conversationId,
          action,
          content,
          options,
          {
            client: client as any,
            isEnabled: Boolean(settings.aiAssistantEnabled),
            callConfig: target as any,
            ...(enableTools
              ? {
                  toolControl: {
                    listTools: () =>
                      (runtime.session.mcp.listTools() as any[]).map((tool: any) => ({
                        name: tool?.name || "",
                        description: tool?.description || "",
                        server: tool?.server || "",
                      })),
                    setActiveToolFilter: (toolNames: string[] | null) =>
                      runtime.session.mcp.setActiveToolFilter(toolNames),
                  },
                }
              : {}),
            ...(toolSelectorRequested
              ? {
                  toolSelector: {
                    enabled: true,
                    selectToolNames: async (
                      prompt: string,
                      tools: Array<{ name: string; description?: string; server?: string }>,
                    ) => {
                      const normalizedPrompt =
                        typeof prompt === "string" ? prompt.trim() : ""
                      const candidates = Array.isArray(tools)
                        ? tools.filter((t) => t?.name)
                        : []
                      if (!normalizedPrompt || candidates.length === 0) {
                        return []
                      }

                      if (!toolSelectorTarget?.providerId || !toolSelectorTarget?.modelId) {
                        return []
                      }

                      try {
                        const resolved = resolveModelRef(settings as any, toolSelectorTarget)
                        const selectorRuntime = await acquireProviderRuntime(
                          resolved.provider as any,
                          [],
                        )
                        try {
                          const selector = new ToolSelectionAgent()
                          return await selector.selectToolNames({
                            prompt: normalizedPrompt,
                            tools: candidates,
                            client: selectorRuntime.session.client as any,
                            model: resolved.model as any,
                          })
                        } finally {
                          await selectorRuntime.release()
                        }
                      } catch (error) {
                        console.warn("Tool selector failed", error)
                        return []
                      }
                    },
                  },
                }
              : {}),
          },
        );

        if (enableTools) {
          runtime.session.mcp.setActiveToolFilter(null)
          result.availableTools = runtime.session.mcp.listTools();
        }

        return result;
      } finally {
        try {
          runtime.session.mcp.setActiveToolFilter(null)
        } catch {}
        if (target.model.capabilities.toolCalling) {
          await runtime.disconnectMcp();
        }
        await runtime.release();
      }
    },
  );

  registerMessageHandler(
    "myz:generatePageInsights",
    async (payload: Partial<PageInsightPayload>) => {
      const settings = await readSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }

      const target = resolveAgentTarget(settings as any, "insights");
      const runtime = await acquireProviderRuntime(
        target.provider as any,
        (settings.aiMcpServers || []) as any,
      );
      try {
        const agent = new InsightsAgent({ client: runtime.session.client as any });
        return await agent.generatePageInsightsWithConfig(payload || {}, {
          isEnabled: Boolean(settings.aiAssistantEnabled),
          callConfig: target as any,
        });
      } finally {
        await runtime.release();
      }
    },
  );

  registerMessageHandler(
    "myz:getConversationHistory",
    async (payload: { conversationId: string; limit?: number }) => {
      const { conversationId, limit } = payload || {};
      return await getConversationHistory(conversationId, limit || 50);
    },
  );

  registerMessageHandler(
    "myz:listConversations",
    async (payload: { limit?: number }) => {
      const { limit } = payload || {};
      return await listConversations(limit || 100);
    },
  );

  registerMessageHandler(
    "myz:exportConversation",
    async (payload: {
      conversationId: string;
      format?: "markdown" | "json";
    }) => {
      const { conversationId, format } = payload || {};
      return await exportConversation(conversationId, format || "markdown");
    },
  );

  registerMessageHandler(
    "myz:deleteConversation",
    async (payload: { conversationId: string }) => {
      const { conversationId } = payload || {};
      await deleteConversation(conversationId);
      return { success: true };
    },
  );

  registerMessageHandler(
    "myz:saveAiGeneratedHighlight",
    async (payload: Partial<MyZRecord>) => {
      // Ensure we have valid timestamps
      const now = new Date().toISOString();
      const highlightData = {
        ...payload,
        createdAt: payload.createdAt || now,
        updatedAt: payload.updatedAt || now,
      };

      const highlight = await saveAiGeneratedHighlight(highlightData);

      // Save to main highlights storage
      const id = highlight.id || generateId();
      const record: MyZRecord = {
        ...highlight,
        id,
        kind: RECORD_KINDS.AI_GENERATED,
        createdAt: highlight.createdAt || now,
        updatedAt: now,
      };

      await saveHighlight(record);

      return record;
    },
  );

  registerMessageHandler(
    "myz:testMcpConnection",
    async (payload: { serverConfig: McpServerSetting }) => {
      const { serverConfig } = payload || {};
      return await testMcpConnection(serverConfig);
    },
  );

  registerMessageHandler("myz:listMcpTools", async () => {
    const settings = await readSettings();
    if (!settings.aiAssistantEnabled) {
      return { tools: [] };
    }

    const mcp = new McpCapability({
      getServers: () => settings.aiMcpServers || [],
    });
    try {
      await mcp.connect();
      return { tools: mcp.listTools() };
    } finally {
      await mcp.disconnect();
    }
  });
}
