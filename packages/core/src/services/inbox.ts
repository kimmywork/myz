/**
 * Inbox domain service.
 *
 * Pure workflow-state logic over an {@link InboxStateStore} port: status /
 * mark / relation rows for the Inbox queue. Storage, badge refresh, deletion
 * logging and change notification stay in the host — this service only owns the
 * state transitions and their record shape.
 */
import {
  inboxMarkRecordId,
  inboxRelationRecordId,
  inboxStatusRecordId,
  type InboxMarkState,
  type InboxRelationState,
  type InboxStatus,
  type InboxStatusState,
} from "@myz/shared/inbox";
import { transitionLifecycle } from "../lifecycle";
import type { InboxStateStore } from "../ports";

/** Write an explicit `status:` record (kept/archived/snoozed set `handledAt`). */
export async function setInboxStatus(
  store: InboxStateStore,
  targetId: string,
  status: InboxStatus,
  options: { snoozedUntil?: string; now?: string } = {},
): Promise<InboxStatusState> {
  const state = transitionLifecycle(targetId, status, options);
  await store.put({
    recordId: inboxStatusRecordId(targetId),
    kind: "status",
    changedAt: state.changedAt,
    payload: {
      status: state.status,
      snoozedUntil: state.snoozedUntil,
      handledAt: state.handledAt,
    },
  });
  return state;
}

export async function getInboxStatus(
  store: InboxStateStore,
  targetId: string,
): Promise<InboxStatusState | null> {
  const record = await store.get(inboxStatusRecordId(targetId));
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
  store: InboxStateStore,
  targetId: string,
  marked: boolean,
  options: { now?: string } = {},
): Promise<InboxMarkState> {
  const changedAt = options.now ?? new Date().toISOString();
  await store.put({
    recordId: inboxMarkRecordId(targetId),
    kind: "mark",
    changedAt,
    payload: { marked },
  });
  return { targetId, marked, changedAt };
}

export async function addInboxRelation(
  store: InboxStateStore,
  sourceId: string,
  targetId: string,
  options: { now?: string } = {},
): Promise<InboxRelationState> {
  const changedAt = options.now ?? new Date().toISOString();
  await store.put({
    recordId: inboxRelationRecordId(sourceId, targetId),
    kind: "rel",
    changedAt,
    payload: { sourceId, targetId },
  });
  return { sourceId, targetId, changedAt };
}

export async function removeInboxRelation(
  store: InboxStateStore,
  sourceId: string,
  targetId: string,
): Promise<void> {
  await store.remove(inboxRelationRecordId(sourceId, targetId));
}

export async function listInboxStates(store: InboxStateStore) {
  return store.listAll();
}
