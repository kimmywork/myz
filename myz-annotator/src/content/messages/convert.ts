import { htmlToMarkdown } from "../utils/htmlToMarkdown";
import { registerMessageHandler } from "./handler";

export function initializeConvertMessageHandlers() {
  registerMessageHandler(
    "myz:convertHtmlToMarkdown",
    async (payload: { html?: string }) => {
      if (!payload?.html) {
        return { markdown: "" };
      }
      const markdown = htmlToMarkdown(payload.html);
      return { markdown };
    },
  );
}
