import { registerMessageHandler } from "./handler";
import {
  AIContextOptions,
  captureAiPageContext,
  clearAiPageChunkAnchors,
  scrollToAiChunk,
  extractPageContentForAi,
} from "../ai-page-context";

export function initializeAiMessageHandlers() {
  registerMessageHandler("myz:captureAiPageContext", async (payload: AIContextOptions) => {
    return captureAiPageContext(payload || {});
  });

  registerMessageHandler("myz:scrollToAiChunk", async (payload: { chunkId: string; snippet?: string }) => {
    const chunkId = payload?.chunkId;
    const snippet = payload?.snippet || "";
    const success = scrollToAiChunk(chunkId, snippet);
    if (!success) {
        throw new Error("Chunk not found");
    }
    return { success };
  });

  registerMessageHandler("myz:clearAiPageChunks", async () => {
    clearAiPageChunkAnchors();
  });

  registerMessageHandler("myz:extractPageContent", async () => {
    return extractPageContentForAi();
  });

  registerMessageHandler("myz:getSelection", async () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";
    return { text };
  });
}
