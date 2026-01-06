import {
  createConversation,
  exportConversation,
  getConversationHistory,
  listConversations,
  readAiConversations,
  saveAiGeneratedHighlight,
  writeAiConversations,
} from "../ai";
import type { PageInsightPayload, ProcessConversationOptions } from "../ai/types.js";
import { testMcpConnection } from "../mcp";
import { AIAssistantSettings, McpServerSetting } from "../settings";
import { generateId, readSettings, saveHighlight } from "../storage";
import { registerMessageHandler } from "./handler";
import { MyZRecord, RECORD_KINDS } from "@/shared/types";
import { deleteConversation } from "@/sidepanel/aiStorage";
import { acquireAiRuntime } from "../ai/runtime/runtimeManager.js";

export function initializeAIMessageHandlers() {
  // AI Assistant handlers
  registerMessageHandler(
    "myz:testAiConnection",
    async (payload: Partial<AIAssistantSettings>) => {
      const settings = await readSettings();
      const merged = { ...settings, ...(payload || {}) };
      if (!merged.aiAssistantEnabled) {
        return { success: false, error: "AI Assistant is not enabled" };
      }

      const runtime = await acquireAiRuntime(merged as any, { allowUntested: true });
      try {
        if (!runtime.session.provider) {
          return { success: false, error: "请先配置 Provider" };
        }

        let model =
          runtime.session.settings.model || runtime.session.settings.aiModel || "gpt-4";
        const customModel =
          runtime.session.settings.customModel || runtime.session.settings.aiCustomModel;
        if (model === "custom" && customModel) {
          model = customModel;
        }

        const response = await runtime.session.client.createCompletion({
          model,
          messages: [
            {
              role: "user",
              content:
                "Please respond with 'Connection successful' to confirm the API is working.",
            },
          ],
          max_tokens: 50,
        } as any);

        return {
          success: true,
          response: response.choices?.[0]?.message?.content || "",
        };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      } finally {
        await runtime.release();
      }
    },
  );

  registerMessageHandler(
    "myz:aiStreamRequest",
    async (payload: {
      conversationId: string;
      message: string;
      action?: string;
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

      const { conversationId, message, action, context, options } = payload || ({} as any);
      if (!conversationId) {
        throw new Error("conversationId is required");
      }
      if (!message) {
        throw new Error("message is required");
      }

      const runtime = await acquireAiRuntime(settings as any);
      if (!runtime.session.isEnabled) {
        await runtime.release();
        throw new Error("AI Assistant is not enabled");
      }

      try {
        await runtime.connectMcp();

        const includePageContext =
          typeof context?.includePageContext === "boolean"
            ? context?.includePageContext
            : undefined;

        return await runtime.conversation.processConversation(
          conversationId,
          action || "custom",
          message,
          {
            ...(options || {}),
            includePageContext:
              includePageContext ?? options?.includePageContext ?? true,
            stream: true,
            metadata: {
              ...(options?.metadata || {}),
              ...(context?.url ? { url: context.url } : {}),
              ...(context?.title ? { title: context.title } : {}),
              source: "sidepanel",
            },
          },
        );
      } finally {
        await runtime.disconnectMcp();
        await runtime.release();
      }
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

      const runtime = await acquireAiRuntime(settings as any);
      if (!runtime.session.isEnabled) {
        await runtime.release();
        throw new Error("AI Assistant is not enabled");
      }

      try {
        await runtime.connectMcp();
        const { conversationId, action, content, options = {} } = payload || {};

        const result = await runtime.conversation.processConversation(
          conversationId,
          action,
          content,
          options,
        );

        result.availableTools = runtime.session.mcp.listTools();

        return result;
      } finally {
        await runtime.disconnectMcp();
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

      const runtime = await acquireAiRuntime(settings as any);
      try {
        if (!runtime.session.isEnabled) {
          throw new Error("AI Assistant is not enabled");
        }
        return await runtime.insights.generatePageInsights(payload || {});
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

    const runtime = await acquireAiRuntime(settings as any);

    try {
      await runtime.connectMcp();
      return { tools: runtime.session.mcp.listTools() };
    } finally {
      await runtime.disconnectMcp();
      await runtime.release();
    }
  });
}
