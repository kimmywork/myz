import {
  inboxMarkRecordId,
  inboxRelationRecordId,
  inboxStatusRecordId,
  type InboxMarkState,
  type InboxRelationState,
  type InboxStatus,
  type InboxStatusState,
} from "@myz/shared/inbox";
import {
  deleteInboxState,
  getAllInboxStates,
  putInboxState,
  readInboxState,
  type InboxStateRecord,
} from "../storage";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Write an explicit `status:` record. Kept/archived/snoozed record `handledAt`
 * so review stats and 5-second undo work; `pending` does not.
 */
export async function setInboxStatus(
  targetId: string,
  status: InboxStatus,
  options: { snoozedUntil?: string; now?: string } = {},
): Promise<InboxStatusState> {
  const changedAt = options.now ?? nowIso();
  const state: InboxStatusState = {
    targetId,
    status,
    changedAt,
    ...(status === "snoozed" && options.snoozedUntil
      ? { snoozedUntil: options.snoozedUntil }
      : {}),
    ...(status === "kept" || status === "archived"
      ? { handledAt: changedAt }
      : {}),
  };
  await putInboxState({
    recordId: inboxStatusRecordId(targetId),
    kind: "status",
    changedAt,
    payload: {
      status: state.status,
      snoozedUntil: state.snoozedUntil,
      handledAt: state.handledAt,
    },
  });
  return state;
}

export async function getInboxStatus(
  targetId: string,
): Promise<InboxStatusState | null> {
  const record = await readInboxState(inboxStatusRecordId(targetId));
  if (!record || record.kind !== "status") return null;
  const payload = record.payload as Partial<InboxStatusState>;
  return {
    targetId,
    status: payload.status ?? "kept",
    snoozedUntil: payload.snoozedUntil,
    handledAt: payload.handledAt,
    changedAt: record.changedAt,
  };
}

export async function setInboxMark(
  targetId: string,
  marked: boolean,
): Promise<InboxMarkState> {
  const changedAt = nowIso();
  await putInboxState({
    recordId: inboxMarkRecordId(targetId),
    kind: "mark",
    changedAt,
    payload: { marked },
  });
  return { targetId, marked, changedAt };
}

export async function addInboxRelation(
  sourceId: string,
  targetId: string,
): Promise<InboxRelationState> {
  const changedAt = nowIso();
  await putInboxState({
    recordId: inboxRelationRecordId(sourceId, targetId),
    kind: "rel",
    changedAt,
    payload: { sourceId, targetId },
  });
  return { sourceId, targetId, changedAt };
}

export async function removeInboxRelation(
  sourceId: string,
  targetId: string,
): Promise<void> {
  await deleteInboxState(inboxRelationRecordId(sourceId, targetId));
}

export async function listInboxStates(): Promise<InboxStateRecord[]> {
  return getAllInboxStates();
}
