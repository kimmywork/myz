import { readSettings, getAllHighlights } from "../storage";
import {
  resetVectorIndex,
  indexRecords,
  searchSimilar,
  applyVectorSearchSettings,
} from "../vectoria-index";
import type { AIProviderSetting } from "../settings";
import { registerMessageHandler } from "./handler";
import { OpenAIEmbedder } from "vectoria/thin";
import { normalizeBaseUrl } from "../ai/runtime/openaiCompatible.js";

export function initializeVectoriaMessageHandlers() {
  registerMessageHandler(
    "myz:vectorTestConnection",
    async (payload: {
      provider: Pick<AIProviderSetting, "baseUrl" | "apiKey">;
      model: string;
    }) => {
      const provider = payload?.provider
      const model = typeof payload?.model === "string" ? payload.model.trim() : ""
      if (!provider?.baseUrl) {
        throw new Error("Base URL is required")
      }
      if (!provider?.apiKey) {
        throw new Error("API key is required")
      }
      if (!model) {
        throw new Error("Model is required")
      }

      // Vectoria's OpenAIEmbedder uses `{endpoint}/embeddings`
      const endpoint = normalizeBaseUrl(provider.baseUrl)
      const embedder = new OpenAIEmbedder({
        apiKey: provider.apiKey,
        endpoint,
        modelName: model,
      })
      try {
        const embedding = await embedder.embed("connection test")
        if (!Array.isArray(embedding) || embedding.length === 0) {
          return { success: false, error: "No embedding returned" }
        }
        return { success: true }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    },
  );

  registerMessageHandler("myz:rebuildVectorIndex", async () => {
    const settings = await readSettings();
    if (!settings.vectorSearch?.enabled) {
      throw new Error("请先启用向量检索");
    }
    if (!settings.vectorSearch?.target || !settings.vectorSearch?.lastTest?.ok) {
      throw new Error("请先选择模型并测试连接")
    }
    applyVectorSearchSettings(settings as any)
    await resetVectorIndex();
    const highlights = await getAllHighlights();
    await indexRecords(highlights);
    return { success: true, count: highlights.length };
  });

  registerMessageHandler(
    "myz:vectoriaSearch",
    async (payload: { text?: string; topK?: number }) => {
      const query =
        typeof payload?.text === "string"
          ? payload.text.trim().slice(0, 2000)
          : "";
      const topK =
        typeof payload?.topK === "number" && payload.topK > 0
          ? Math.min(10, Math.floor(payload.topK))
          : 3;
      if (!query) {
        return { results: [] };
      }
      try {
        const settings = await readSettings()
        applyVectorSearchSettings(settings as any)
      } catch (error) {
        console.warn("Vectoria apply settings failed", error)
      }
      const results = await searchSimilar(query, { topK });
      return {
        results: results.map((item) => ({
          id: item.id,
          text: item.text,
          score: item.score,
          metadata: item.metadata || {},
        })),
      };
    },
  );

  registerMessageHandler(
    "myz:showRelatedHighlights",
    async (payload: any, sender: chrome.runtime.MessageSender) => {
      try {
        const tabId = sender?.tab?.id;
        if (typeof tabId === "number") {
          await chrome.sidePanel.open({ tabId });
        } else {
          await chrome.sidePanel.open({ windowId: sender?.tab?.windowId! });
        }
      } catch (error) {
        console.warn("Failed to open sidepanel", error);
      }
      try {
        await chrome.runtime.sendMessage({
          type: "myz:showRelatedHighlights",
          payload,
        });
      } catch (error) {
        console.warn("Forward related highlights failed", error);
      }
      return { ok: true };
    },
  );
}
