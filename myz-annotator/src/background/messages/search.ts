import { registerMessageHandler } from "./handler";

export function initializeSearchMessageHandlers() {
  registerMessageHandler("myz:search", async (payload: { query: string }) => {
    const query = (payload?.query || "").trim();
    if (!query) {
      return { ok: true };
    }
    try {
      await chrome.search.query({
        text: query,
        disposition: "NEW_TAB",
      });
      return { ok: true };
    } catch (error) {
      console.error("Search failed", error);
      throw error;
    }
  });
}
