import { createAiProvider } from "./aiProvider.js";
import {
  readAiConversations,
  writeAiConversations,
  createConversation,
  addMessageToConversation,
  getConversationHistory,
  saveAiGeneratedHighlight,
  exportConversation,
  deleteConversation,
  listConversations,
} from "./ai.js";
import { testMcpConnection } from "./mcp.js";

export function createAiMessageHandlers(readSettings) {
  async function getSettings() {
    const settings = await readSettings();
    return {
      aiAssistantEnabled: settings.aiAssistantEnabled || false,
      aiApiEndpoint: settings.aiApiEndpoint || "",
      aiApiKey: settings.aiApiKey || "",
      aiModel: settings.aiModel || "gpt-4",
      aiMaxTokens: settings.aiMaxTokens || 4000,
      aiMcpServers: settings.aiMcpServers || [],
    };
  }

  return {
    async "myz:testAiConnection"() {
      const settings = await getSettings();
      if (!settings.aiAssistantEnabled) {
        return { success: false, error: "AI Assistant is not enabled" };
      }

      const provider = createAiProvider(settings);
      return await provider.testConnection();
    },

    async "myz:createConversation"(payload) {
      const settings = await getSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }

      const { url, title, action } = payload || {};
      const conversation = await createConversation(url, title);

      // Initialize conversation with context if provided
      if (action && url) {
        const state = await readAiConversations();
        state.conversations[conversation.id] = conversation;
        state.activeConversationId = conversation.id;
        await writeAiConversations(state);
      }

      return conversation;
    },

    async "myz:processWithAi"(payload) {
      const settings = await getSettings();
      if (!settings.aiAssistantEnabled) {
        throw new Error("AI Assistant is not enabled");
      }

      const { conversationId, action, content, options = {} } = payload || {};

      const provider = createAiProvider(settings);
      await provider.initializeMcpClients();

      try {
        const result = await provider.processConversation(
          conversationId,
          action,
          content,
          options,
        );

        // Add MCP tools info to response if available
        const tools = await provider.getAvailableTools();
        result.availableTools = tools;

        return result;
      } finally {
        await provider.disconnectMcpClients();
      }
    },

    async "myz:getConversationHistory"(payload) {
      const { conversationId, limit } = payload || {};
      return await getConversationHistory(conversationId, limit || 50);
    },

    async "myz:listConversations"(payload) {
      const { limit } = payload || {};
      return await listConversations(limit || 100);
    },

    async "myz:exportConversation"(payload) {
      const { conversationId, format } = payload || {};
      return await exportConversation(conversationId, format || "markdown");
    },

    async "myz:deleteConversation"(payload) {
      const { conversationId } = payload || {};
      await deleteConversation(conversationId);
      return { success: true };
    },

    async "myz:saveAiGeneratedHighlight"(payload) {
      const highlight = await saveAiGeneratedHighlight(payload);
      return highlight;
    },

    async "myz:testMcpConnection"(payload) {
      const { serverConfig } = payload || {};
      return await testMcpConnection(serverConfig);
    },

    async "myz:listMcpTools"() {
      const settings = await getSettings();
      if (!settings.aiAssistantEnabled) {
        return { tools: [] };
      }

      const provider = createAiProvider(settings);
      await provider.initializeMcpClients();

      try {
        const tools = await provider.getAvailableTools();
        return { tools };
      } finally {
        await provider.disconnectMcpClients();
      }
    },
  };
}
