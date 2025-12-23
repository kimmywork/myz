
import { deleteConversation } from "@/sidepanel/aiStorage";
import { createConversation, exportConversation, getConversationHistory, listConversations, readAiConversations, saveAiGeneratedHighlight, writeAiConversations } from "../ai";
import { createAiProvider, PageInsightPayload, ProcessConversationOptions } from "../aiProvider";
import { AIAssistantSettings, McpServerSetting } from "../settings";
import { generateId, readSettings, saveHighlight } from "../storage";
import { registerMessageHandler } from "./handler";
import { testMcpConnection } from "../mcp";
import { MyZRecord, RECORD_KINDS } from "@/shared/types";


export function initializeAIMessageHandlers() {
  // AI Assistant handlers
  registerMessageHandler("myz:testAiConnection", async (payload: Partial<AIAssistantSettings>) => {
    const settings = await readSettings();
    const merged = { ...settings, ...(payload || {}) };
    if (!merged.aiAssistantEnabled) {
      return { success: false, error: "AI Assistant is not enabled" };
    }

    const provider = createAiProvider(merged, { allowUntested: true });
    if (!provider.provider) {
      return { success: false, error: "请先配置 Provider" };
    }

    return await provider.testConnection();
  });

  registerMessageHandler("myz:createConversation", async (payload: { url: string; title: string; }) => {
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
  });

  registerMessageHandler("myz:processWithAi", async (payload: {
    conversationId: string;
    action: string;
    content: string;
    options?: Partial<ProcessConversationOptions>;
  }) => {
    const settings = await readSettings();
    if (!settings.aiAssistantEnabled) {
      throw new Error("AI Assistant is not enabled");
    }

    const provider = createAiProvider(settings);

    try {
      await provider.initializeMcpClients();
      const { conversationId, action, content, options = {} } = payload || {};

      const result = await provider.processConversation(
        conversationId,
        action,
        content,
        options,
      );

      const tools = await provider.getAvailableTools();
      result.availableTools = tools;

      return result;
    } finally {
      await provider.disconnectMcpClients();
    }
    });

  registerMessageHandler("myz:generatePageInsights", async (payload: Partial<PageInsightPayload>) => {
    const settings = await readSettings();
    if (!settings.aiAssistantEnabled) {
      throw new Error("AI Assistant is not enabled");
    }

    const provider = createAiProvider(settings);
    return await provider.generatePageInsights(payload || {});
  });

  registerMessageHandler("myz:getConversationHistory", async (payload: { conversationId: string; limit?: number; }) => {
    const { conversationId, limit } = payload || {};
    return await getConversationHistory(conversationId, limit || 50);
  });

  registerMessageHandler("myz:listConversations", async (payload: { limit?: number; }) => {
    const { limit } = payload || {};
    return await listConversations(limit || 100);
  });

  registerMessageHandler("myz:exportConversation", async (payload: { conversationId: string; format?: "markdown" | "json"; }) => {
    const { conversationId, format } = payload || {};
    return await exportConversation(conversationId, format || "markdown");
  });

  registerMessageHandler("myz:deleteConversation", async (payload: { conversationId: string; }) => {
    const { conversationId } = payload || {};
    await deleteConversation(conversationId);
    return { success: true };
  });

  registerMessageHandler("myz:saveAiGeneratedHighlight", async (payload: Partial<MyZRecord>) => {
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
  });

  registerMessageHandler("myz:testMcpConnection", async (payload: { serverConfig: McpServerSetting }) => {
    const { serverConfig } = payload || {};
    return await testMcpConnection(serverConfig);
  });

  registerMessageHandler("myz:listMcpTools", async () => {
    const settings = await readSettings();
    if (!settings.aiAssistantEnabled) {
      return { tools: [] };
    }

    const provider = createAiProvider(settings);

    try {
      await provider.initializeMcpClients();
      const tools = await provider.getAvailableTools();
      return { tools };
    } finally {
      await provider.disconnectMcpClients();
    }
  });
}