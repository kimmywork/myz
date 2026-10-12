import { sendMessage } from "@myz/shared/messaging";
import { computeHighlightStats } from "./cache.ts";

function syncBadgeWithBackground() {
  let isTopLevel = false;
  try {
    isTopLevel = window.top === window;
  } catch (error) {
    isTopLevel = false;
  }
  if (!isTopLevel) return;
  const stats = computeHighlightStats();
  sendMessage("myz:updateBadge", {
    count: stats.total,
    total: stats.total,
    highlightCount: stats.highlightCount,
    savedCount: stats.savedCount,
  }).catch((error) => {
    // Badge sync is advisory; the content script keeps working regardless.
    console.debug("MyZ: badge sync failed", error);
  });
}

export function updateHighlightIndicators() {
  syncBadgeWithBackground();
}
