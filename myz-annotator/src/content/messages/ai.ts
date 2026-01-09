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
    "myz:extractPrimaryContent",
    async (payload: { maxChars?: number }) => {
      const requested = Number(payload?.maxChars);
      const maxTotalChars =
        Number.isFinite(requested) && requested > 0
          ? Math.min(60000, Math.max(1000, Math.floor(requested)))
          : 15000;

      const result = captureAiPageContext({
        maxTotalChars,
        registerAnchors: false,
      });

      const text = result.chunks.map((c) => c.text).join("\n\n");

      return {
        title: result.title,
        url: result.url,
        text,
        truncated: Boolean(result.truncated),
        chunkCount: result.chunkCount,
        wordCount: result.wordCount,
      };
    },
  );

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

  registerMessageHandler(
    "myz:extractSearchResults",
    async (payload: { engine?: string; limit?: number }) => {
      const engine = payload?.engine === "google" ? "google" : "bing";
      const limit =
        typeof payload?.limit === "number" && payload.limit > 0
          ? Math.min(10, Math.floor(payload.limit))
          : 5;

      const results: Array<{ title: string; url: string; snippet: string }> = [];

      const pushResult = (title: string, url: string, snippet: string) => {
        const normalizedUrl = typeof url === "string" ? url.trim() : "";
        if (!normalizedUrl || !normalizedUrl.startsWith("http")) {
          return;
        }
        const normalizedTitle = typeof title === "string" ? title.trim() : "";
        const normalizedSnippet = typeof snippet === "string" ? snippet.trim() : "";
        results.push({
          title: normalizedTitle,
          url: normalizedUrl,
          snippet: normalizedSnippet,
        });
      };

      const textContent = (el: Element | null | undefined) =>
        el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";

      if (engine === "bing") {
        const items = Array.from(document.querySelectorAll("li.b_algo"));
        for (const item of items) {
          if (results.length >= limit) break;
          const a = item.querySelector("h2 a");
          const title = textContent(a);
          const url = (a as HTMLAnchorElement | null)?.href || "";
          const snippet =
            textContent(item.querySelector("div.b_caption p")) ||
            textContent(item.querySelector("p"));
          pushResult(title, url, snippet);
        }
      } else {
        const items = Array.from(document.querySelectorAll("div#search a h3"));
        for (const h3 of items) {
          if (results.length >= limit) break;
          const anchor = h3.closest("a") as HTMLAnchorElement | null;
          const title = textContent(h3);
          const url = anchor?.href || "";

          let snippet = "";
          try {
            const container = anchor?.closest("div");
            if (container) {
              snippet =
                textContent(container.querySelector("div[data-sncf='1']")) ||
                textContent(container.querySelector("div.VwiC3b")) ||
                textContent(container.querySelector("span"));
            }
          } catch {}

          pushResult(title, url, snippet);
        }
      }

      return { engine, results };
    },
  );
}
