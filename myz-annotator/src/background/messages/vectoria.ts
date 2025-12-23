import { readSettings, writeSettings, getAllHighlights } from "../storage";
import {
  applyVectoriaSettings,
  warmVectoriaModel,
  testVectorProvider,
  resetVectorIndex,
  indexRecords,
  VectoriaSettings,
  searchSimilar,
} from "../vectoria-index";
import { registerMessageHandler } from "./handler";

export function initializeVectoriaMessageHandlers() {
  registerMessageHandler("myz:loadVectorModel", async () => {
    const settings = await readSettings();
    if (!settings.vectorSearchEnabled) {
      throw new Error("向量检索未启用");
    }
    applyVectoriaSettings(settings);
    try {
      await warmVectoriaModel();
      const updated = await writeSettings({ vectorModelReady: true });
      applyVectoriaSettings(updated);
      return { success: true, vectorModelReady: true };
    } catch (error) {
      await writeSettings({ vectorModelReady: false });
      applyVectoriaSettings({
        vectorSearchEnabled: settings.vectorSearchEnabled,
        vectorModelReady: false,
      });
      throw error;
    }
  });

  registerMessageHandler(
    "myz:testVectorProvider",
    async (payload: Partial<VectoriaSettings>) => {
      const config = {
        useLocalModel:
          payload?.useLocalModel !== false &&
          payload?.useLocalModel !== "remote",
        openAiEndpoint: payload?.openAiEndpoint || "",
        openAiApiKey: payload?.openAiApiKey || "",
        openAiModel: payload?.openAiModel || "text-embedding-3-small",
      };
      await testVectorProvider(config);
      return { success: true };
    },
  );

  registerMessageHandler("myz:rebuildVectorIndex", async () => {
    const settings = await readSettings();
    if (!settings.vectorSearchEnabled || !settings.vectorModelReady) {
      throw new Error("请先启用并加载向量模型");
    }
    applyVectoriaSettings(settings);
    await warmVectoriaModel();
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
