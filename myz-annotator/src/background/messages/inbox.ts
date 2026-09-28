import type { InboxStatus } from "@myz/shared/inbox";
import {
  addInboxRelation,
  getInboxStatus,
  listInboxStates,
  removeInboxRelation,
  setInboxMark,
  setInboxStatus,
} from "../inbox/actions";
import { buildQueue } from "../inbox/queue";
import { registerMessageHandler } from "./handler";

export type { InboxQueueItem, InboxQueueResult } from "../inbox/queue";

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
