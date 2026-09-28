import type { InboxStatus, InboxStatusState } from "@myz/shared/inbox";
import {
  isInboxPending,
  parseInboxRecordId,
  resolveInboxStatus,
} from "@myz/shared/inbox";
import type { MyZRecord } from "@myz/shared/types";
import {
  addInboxRelation,
  getInboxStatus,
  listInboxStates,
  removeInboxRelation,
  setInboxMark,
  setInboxStatus,
} from "../inbox/actions";
import { getAllHighlights } from "../storage";
import { recordIdForHighlight } from "../sync/records";
import { registerMessageHandler } from "./handler";

export interface InboxQueueItem {
  record: MyZRecord;
  targetId: string;
  status: InboxStatus;
  state: InboxStatusState | null;
  marked: boolean;
}

export interface InboxQueueResult {
  pending: InboxQueueItem[];
  snoozed: InboxQueueItem[];
  marked: InboxQueueItem[];
  counts: { pending: number; snoozed: number; marked: number };
  oldestPendingAt: string | null;
}

async function buildQueue(): Promise<InboxQueueResult> {
  const [highlights, states] = await Promise.all([
    getAllHighlights(),
    listInboxStates(),
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
  };
}

export function initializeInboxMessageHandlers() {
  registerMessageHandler(
    "myz:inboxSetStatus",
    async (payload: {
      targetId: string;
      status: InboxStatus;
      snoozedUntil?: string;
    }) => {
      if (!payload?.targetId || !payload.status) {
        throw new Error("Missing inbox status payload");
      }
      return setInboxStatus(payload.targetId, payload.status, {
        snoozedUntil: payload.snoozedUntil,
      });
    },
  );

  registerMessageHandler(
    "myz:inboxGetStatus",
    async (payload: { targetId: string }) => {
      return getInboxStatus(payload.targetId);
    },
  );

  registerMessageHandler(
    "myz:inboxSetMark",
    async (payload: { targetId: string; marked: boolean }) => {
      return setInboxMark(payload.targetId, Boolean(payload.marked));
    },
  );

  registerMessageHandler(
    "myz:inboxAddRelation",
    async (payload: { sourceId: string; targetId: string }) => {
      return addInboxRelation(payload.sourceId, payload.targetId);
    },
  );

  registerMessageHandler(
    "myz:inboxRemoveRelation",
    async (payload: { sourceId: string; targetId: string }) => {
      await removeInboxRelation(payload.sourceId, payload.targetId);
      return { ok: true };
    },
  );

  registerMessageHandler("myz:inboxListStates", async () => {
    return listInboxStates();
  });

  registerMessageHandler("myz:inboxQueue", async () => {
    return buildQueue();
  });
}
