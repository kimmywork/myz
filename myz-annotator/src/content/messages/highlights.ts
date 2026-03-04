import {
  buildHighlightStateSnapshot,
  focusHighlight,
  restoreHighlights,
} from "../highlight-state";
import { registerMessageHandler } from "./handler";

export function initializeHighlightMessageHandlers() {
  registerMessageHandler(
    "myz:scrollToHighlight",
    async (payload: { id: string }) => {
      const success = focusHighlight(payload?.id);
      if (!success) {
        throw new Error("Highlight not found");
      }
      return { success };
    },
  );

  registerMessageHandler("myz:refreshHighlights", async () => {
    await restoreHighlights();
  });

  registerMessageHandler("myz:getHighlightState", async () => {
    return buildHighlightStateSnapshot();
  });
}
