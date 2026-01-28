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

const PENDING_RELATED_HIGHLIGHTS_KEY = "myz::pendingRelatedHighlights";

async function writePendingRelatedHighlights(payload: any) {
  const wrapped = {
    payload,
    createdAt: Date.now(),
  };
  try {
    await chrome.storage.session.set({
      [PENDING_RELATED_HIGHLIGHTS_KEY]: wrapped,
    });
  } catch {
    await chrome.storage.local.set({
      [PENDING_RELATED_HIGHLIGHTS_KEY]: wrapped,
    });
  }
}

async function popPendingRelatedHighlights() {
  const unwrap = (data: any) => data?.[PENDING_RELATED_HIGHLIGHTS_KEY]?.payload || null;
  try {
    const result = await chrome.storage.session.get(PENDING_RELATED_HIGHLIGHTS_KEY);
    await chrome.storage.session.remove(PENDING_RELATED_HIGHLIGHTS_KEY);
    return unwrap(result);
  } catch {
    const result = await chrome.storage.local.get(PENDING_RELATED_HIGHLIGHTS_KEY);
    await chrome.storage.local.remove(PENDING_RELATED_HIGHLIGHTS_KEY);
    return unwrap(result);
  }
}

export function initializeVectoriaMessageHandlers() {
  registerMessageHandler("myz:popPendingRelatedHighlights", async () => {
    const pending = await popPendingRelatedHighlights();
    return pending || null;
  });

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
      // Attempt to open SidePanel as early as possible (before any await), otherwise
      // Chrome may treat it as not initiated by a user gesture.
      try {
        const tabId = sender?.tab?.id;
        if (typeof tabId === "number") {
          void chrome.sidePanel.open({ tabId });
        } else if (typeof sender?.tab?.windowId === "number") {
          void chrome.sidePanel.open({ windowId: sender.tab.windowId });
        }
      } catch {
        // ignore
      }

      let filteredPayload = payload;
      try {
        const settings = await readSettings();
        const rawThreshold = (settings as any)?.vectorSearch?.matchThreshold;
        const threshold =
          typeof rawThreshold === "number" && Number.isFinite(rawThreshold)
            ? Math.min(1, Math.max(0.4, rawThreshold))
            : 0.5;
        const matches = Array.isArray(payload?.matches) ? payload.matches : [];
        const filteredMatches = matches.filter(
          (item: any) =>
            typeof item?.score === "number" && Number.isFinite(item.score) && item.score >= threshold,
        );
        filteredPayload = { ...payload, matches: filteredMatches };
        if (!filteredMatches.length) {
          return { ok: true, filtered: 0 };
        }
      } catch (error) {
        // ignore: fallback to original payload
      }

      // Persist the payload so the SidePanel can pick it up even if it is not open yet.
      try {
        await writePendingRelatedHighlights(filteredPayload);
      } catch {
        // ignore
      }

      try {
        await chrome.runtime.sendMessage({
          type: "myz:showRelatedHighlights",
          payload: filteredPayload,
        });
      } catch (error) {
        // SidePanel might not be ready/open. It'll pull from pending storage on init.
      }
      return { ok: true };
    },
  );
}
