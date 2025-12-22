import { registerMessageHandler } from "./handler";

export function initializeCaptureMessageHandlers() {
  registerMessageHandler(
    "myz:captureSelection",
    async (
      payload: { format?: "jpeg" | "png"; quality?: number },
      sender: chrome.runtime.MessageSender,
    ) => {
      if (!sender?.tab || typeof sender.tab.windowId === "undefined") {
        throw new Error("No active tab for capture");
      }
      const format = payload?.format === "jpeg" ? "jpeg" : "png";
      const quality =
        typeof payload?.quality === "number" ? payload.quality : undefined;
      const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
        format,
        quality,
      });
      return { dataUrl };
    },
  );
}
