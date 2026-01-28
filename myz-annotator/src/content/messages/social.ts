import { registerMessageHandler } from "./handler";
import { scrapeTwitterTimeline } from "@/content/social/twitter";
import { scrapeMastodonTimeline } from "@/content/social/mastodon";
import { isTwitterHost } from "@/shared/social/twitter";

/**
 * Social scraping message handlers.
 *
 * These handlers are used by background importers that open social pages in tabs
 * and ask the content script to scrape DOM content.
 */
export function initializeSocialMessageHandlers() {
  registerMessageHandler(
    "myz:scrapeTwitterTimeline",
    async (payload: any): Promise<any> => {
      if (!isTwitterHost(window.location.hostname)) {
        throw new Error("当前页面不是 Twitter/X");
      }
      return scrapeTwitterTimeline(payload || {});
    },
  );

  registerMessageHandler(
    "myz:scrapeMastodonTimeline",
    async (payload: any): Promise<any> => {
      return scrapeMastodonTimeline(payload || {});
    },
  );
}
