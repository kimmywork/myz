import { defineStore } from "pinia";
import { ref } from "vue";
import { VectoriaSearchResult } from "@/background/vectoria-index.js";

export const usePageStore = defineStore("page", () => {
  const currentUrl = ref("");
  const currentTabId = ref<number | null>(null);
  const pageTitle = ref("");
  const pageContent = ref("");
  const relatedMatches = ref<VectoriaSearchResult[]>([]);

  async function loadPageContext(
    tabId?: number,
    options?: { includeContent?: boolean },
  ) {
    const includeContent = options?.includeContent !== false;
    try {
      const tab =
        typeof tabId === "number"
          ? await chrome.tabs.get(tabId).catch(() => null)
          : (
              await chrome.tabs.query({
                active: true,
                currentWindow: true,
              })
            )?.[0] || null;
      if (tab) {
        currentTabId.value = tab.id || null;
        currentUrl.value = tab.url || "";
        pageTitle.value = tab.title || "";

        if (!includeContent) {
          pageContent.value = "";
          return;
        }

        try {
          const result = await chrome.tabs
            .sendMessage(tab.id!, {
              type: "myz:extractPageContent",
            })
            .catch(() => null);

          let responseData = result;
          if (result && result.data) {
            responseData = result.data;
          }

          if (responseData && responseData.text) {
            pageContent.value = responseData.text;
          } else {
            pageContent.value = "";
          }
        } catch (e) {
          console.warn("Could not extract page content:", e);
          pageContent.value = "";
        }
      } else {
        pageContent.value = "";
      }
    } catch (e) {
      console.error("Failed to load page context:", e);
    }
  }

  async function clearPageChunkAnchors() {
    if (!currentTabId.value) return;
    try {
      await chrome.tabs.sendMessage(currentTabId.value, {
        type: "myz:clearAiPageChunks",
      });
    } catch {
      // ignore
    }
  }

  async function getSelection() {
    if (!currentTabId.value) return "";
    try {
      const result = await chrome.tabs.sendMessage(currentTabId.value, {
        type: "myz:getSelection",
      });
      let responseData = result;
      if (result && result.data) {
        responseData = result.data;
      }
      return responseData?.text || "";
    } catch (e) {
      return "";
    }
  }

  async function scrollToCitation(chunkId: string, snippet = "") {
    if (!currentTabId.value) return;
    try {
      await chrome.tabs.sendMessage(currentTabId.value, {
        type: "myz:scrollToAiChunk",
        chunkId,
        snippet,
      });
    } catch (e) {
      console.error("Failed to scroll to citation:", e);
    }
  }

  return {
    currentUrl,
    currentTabId,
    pageTitle,
    pageContent,
    relatedMatches,
    loadPageContext,
    clearPageChunkAnchors,
    getSelection,
    scrollToCitation,
  };
});
