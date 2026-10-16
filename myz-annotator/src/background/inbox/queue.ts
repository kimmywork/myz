import { buildInboxQueue, type InboxQueueResult } from "@myz/core/inbox";
import { getAllHighlights, getAllInboxStates } from "../storage";

export type {
  InboxQueueItem,
  InboxQueueResult,
  InboxReview,
} from "@myz/core/inbox";

/**
 * Read the local records + workflow states and derive the Inbox queue via the
 * core read model. The badge side effect stays here (chrome-only).
 */
export async function buildQueue(): Promise<InboxQueueResult> {
  const [highlights, states] = await Promise.all([
    getAllHighlights(),
    getAllInboxStates(),
  ]);
  return buildInboxQueue(highlights, states);
}

/** Show a single "1" badge while the Inbox has pending items. */
export async function refreshInboxBadge(): Promise<void> {
  try {
    const queue = await buildQueue();
    const text = queue.counts.pending > 0 ? "1" : "";
    await chrome.action.setBadgeText({ text });
    if (text) {
      await chrome.action.setBadgeBackgroundColor({
        color: [37, 99, 235, 255],
      });
      if (typeof chrome.action.setBadgeTextColor === "function") {
        await chrome.action.setBadgeTextColor({ color: [255, 255, 255, 255] });
      }
    }
  } catch (error) {
    console.warn("Failed to refresh inbox badge", error);
  }
}
