import {
  addInboxRelation as coreAddRelation,
  getInboxStatus as coreGetStatus,
  listInboxStates as coreListStates,
  removeInboxRelation as coreRemoveRelation,
  setInboxMark as coreSetMark,
  setInboxStatus as coreSetStatus,
} from "@myz/core/services/inbox";
import {
  inboxRelationRecordId,
  type InboxStatus,
  type InboxStatusState,
} from "@myz/shared/inbox";
import { inboxStateStore } from "../stores";
import { recordInboxDeletion } from "../sync/deletions";
import { refreshInboxBadge } from "./queue";
import { changeBus } from "@/messaging/changes";

/**
 * Host wrappers over the core Inbox service: the domain transitions live in
 * `@myz/core/services/inbox`; this layer adds the host side effects (badge,
 * deletion logging, change notification).
 */

export async function setInboxStatus(
  targetId: string,
  status: InboxStatus,
  options: { snoozedUntil?: string; now?: string } = {},
): Promise<InboxStatusState> {
  const state = await coreSetStatus(inboxStateStore, targetId, status, options);
  await refreshInboxBadge();
  changeBus.publish({ domain: "inbox", ids: [targetId] });
  return state;
}

export async function getInboxStatus(
  targetId: string,
): Promise<InboxStatusState | null> {
  return coreGetStatus(inboxStateStore, targetId);
}

export async function setInboxMark(targetId: string, marked: boolean) {
  const state = await coreSetMark(inboxStateStore, targetId, marked);
  await refreshInboxBadge();
  changeBus.publish({ domain: "inbox", ids: [targetId] });
  return state;
}

export async function addInboxRelation(sourceId: string, targetId: string) {
  const state = await coreAddRelation(inboxStateStore, sourceId, targetId);
  changeBus.publish({ domain: "inbox", ids: [sourceId, targetId] });
  return state;
}

export async function removeInboxRelation(
  sourceId: string,
  targetId: string,
): Promise<void> {
  await coreRemoveRelation(inboxStateStore, sourceId, targetId);
  await recordInboxDeletion(inboxRelationRecordId(sourceId, targetId));
  changeBus.publish({ domain: "inbox", ids: [sourceId, targetId] });
}

export async function listInboxStates() {
  return coreListStates(inboxStateStore);
}
