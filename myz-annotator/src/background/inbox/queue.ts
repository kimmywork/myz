import {
  isInboxPending,
  parseInboxRecordId,
  resolveInboxStatus,
  type InboxStatus,
  type InboxStatusState,
} from "@myz/shared/inbox";
import type { MyZRecord } from "@myz/shared/types";
import { getAllHighlights, getAllInboxStates } from "../storage";
import { recordIdForHighlight } from "../sync/records";

export interface InboxQueueItem {
  record: MyZRecord;
  targetId: string;
  status: InboxStatus;
  state: InboxStatusState | null;
  marked: boolean;
}

export interface InboxReview {
  overdueSnoozed: number;
  oldestPendingAt: string | null;
  capturedThisWeek: number;
  handledThisWeek: number;
}

export interface InboxQueueResult {
  pending: InboxQueueItem[];
  snoozed: InboxQueueItem[];
  marked: InboxQueueItem[];
  counts: { pending: number; snoozed: number; marked: number };
  oldestPendingAt: string | null;
  review: InboxReview;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function buildQueue(): Promise<InboxQueueResult> {
  const [highlights, states] = await Promise.all([
    getAllHighlights(),
    getAllInboxStates(),
  ]);
  const statusByTarget = new Map<string, InboxStatusState>();
  const markByTarget = new Map<string, boolean>();
  for (const state of states) {
    const parsed = parseInboxRecordId(state.recordId);
    if (!parsed) continue;
    const payload = state.payload as Record<string, unknown>;
    if (parsed.kind === "status") {
      statusByTarget.set(parsed.targetId, {
        targetId: parsed.targetId,
        status: (payload.status as InboxStatus) ?? "kept",
        snoozedUntil:
          typeof payload.snoozedUntil === "string"
            ? payload.snoozedUntil
            : undefined,
        handledAt:
          typeof payload.handledAt === "string" ? payload.handledAt : undefined,
        changedAt: state.changedAt,
      });
    } else if (parsed.kind === "mark") {
      markByTarget.set(parsed.targetId, Boolean(payload.marked));
    }
  }

  const now = Date.now();
  const items: InboxQueueItem[] = highlights.map((record) => {
    const targetId = recordIdForHighlight(record.id);
    const statusState = statusByTarget.get(targetId) ?? null;
    return {
      record,
      targetId,
      status: resolveInboxStatus(statusState),
      state: statusState,
      marked: markByTarget.get(targetId) ?? false,
    };
  });

  const pending = items.filter((item) => isInboxPending(item.state, now));
  const snoozed = items.filter(
    (item) =>
      item.state?.status === "snoozed" && !isInboxPending(item.state, now),
  );
  const marked = items.filter((item) => item.marked);
  const oldestPendingAt =
    pending
      .map((item) => item.record.createdAt)
      .filter(Boolean)
      .sort()[0] ?? null;

  const weekAgo = now - WEEK_MS;
  const review: InboxReview = {
    overdueSnoozed: snoozed.filter(
      (item) =>
        item.state?.snoozedUntil && Date.parse(item.state.snoozedUntil) <= now,
    ).length,
    oldestPendingAt,
    capturedThisWeek: items.filter(
      (item) =>
        item.record.createdAt && Date.parse(item.record.createdAt) >= weekAgo,
    ).length,
    handledThisWeek: items.filter(
      (item) =>
        item.state?.handledAt && Date.parse(item.state.handledAt) >= weekAgo,
    ).length,
  };

  return {
    pending,
    snoozed,
    marked,
    counts: {
      pending: pending.length,
      snoozed: snoozed.length,
      marked: marked.length,
    },
    oldestPendingAt,
    review,
  };
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
