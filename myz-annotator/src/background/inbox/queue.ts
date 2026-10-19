import { buildInboxQueue, type InboxQueueResult } from "@myz/core/inbox";
import { notifier } from "../runtime";
import { getAllHighlights, getAllInboxStates } from "../storage";

export type {
  InboxQueueItem,
  InboxQueueResult,
  InboxReview,
} from "@myz/core/inbox";

/**
 * Read the local records + workflow states and derive the Inbox queue via the
 * core read model. The badge side effect goes through the `Notifier` port.
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
    if (queue.counts.pending > 0) {
      await notifier.setBadge("1", [37, 99, 235, 255]);
    } else {
      await notifier.setBadge("");
    }
  } catch (error) {
    console.warn("Failed to refresh inbox badge", error);
  }
}
