import { registerMessageHandler } from "./handler";
import {
  AIContextOptions,
  captureAiPageContext,
  clearAiPageChunkAnchors,
  scrollToAiChunk,
  extractPageContentForAi,
} from "../ai-page-context";
import { sendMessage } from "@/shared/messaging.js";

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

  registerMessageHandler(
    "myz:analyzePage",
    async (payload: { action?: string; contextOptions?: AIContextOptions }) => {
      const action = payload?.action === "key_points" ? "key_points" : "summarize";
      const context = captureAiPageContext({
        maxTotalChars: 80000,
        ...(payload?.contextOptions || {}),
        registerAnchors: true,
      });

      const insights: any = await sendMessage("myz:generatePageInsights", {
        action,
        title: context.title,
        url: context.url,
        chunks: context.chunks,
      });

      return {
        success: true,
        action,
        markdown: insights?.markdown || "",
        chunkGroups: insights?.chunkGroups || 0,
        generatedAt: insights?.generatedAt || new Date().toISOString(),
        context: {
          chunkCount: context.chunkCount,
          wordCount: context.wordCount,
          truncated: context.truncated,
        },
      };
    },
  );

  registerMessageHandler("myz:getSelection", async () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";
    return { text };
  });

  registerMessageHandler(
    "myz:fetchImageAsDataUrl",
    async (payload: { srcUrl?: string }) => {
      const srcUrl =
        typeof payload?.srcUrl === "string" ? payload.srcUrl.trim() : "";
      if (!srcUrl) {
        throw new Error("srcUrl is required");
      }
      if (srcUrl.startsWith("data:")) {
        const mimeType = srcUrl.slice(5).split(";")[0] || "";
        return { dataUrl: srcUrl, mimeType };
      }

      const response = await fetch(srcUrl, { credentials: "include" });
      if (!response.ok) {
        throw new Error(
          `fetch image failed: ${response.status} ${response.statusText}`,
        );
      }

      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Failed to read image blob"));
        reader.readAsDataURL(blob);
      });
      if (!dataUrl.startsWith("data:")) {
        throw new Error("Failed to convert image to data URL");
      }
      return { dataUrl, mimeType: blob.type || "" };
    },
  );
}
