import { recordIdForHighlight } from "@myz/core/identity";
import { parseInboxRecordId } from "@myz/shared/inbox";
import { deleteInboxState, getAllInboxStates } from "../storage";
import { upsertDeletion } from "./storage";

/**
 * Record a highlight deletion as an explicit tombstone (the new format never
 * treats absence as deletion). Also tombstone the highlight's Inbox workflow
 * records so status/mark/relation deletions propagate.
 */
export async function recordHighlightDeletion(id: string): Promise<void> {
  const targetId = recordIdForHighlight(id);
  const deletedAt = new Date().toISOString();
  await upsertDeletion({ recordId: targetId, deletedAt });
  await recordInboxDeletionsForTarget(targetId, deletedAt);
}

/** Record a standalone Inbox record deletion (e.g. removing a relation). */
export async function recordInboxDeletion(recordId: string): Promise<void> {
  await upsertDeletion({ recordId, deletedAt: new Date().toISOString() });
}

async function recordInboxDeletionsForTarget(
  targetId: string,
  deletedAt: string,
): Promise<void> {
  const statusId = `status:${targetId}`;
  const markId = `mark:${targetId}`;
  await upsertDeletion({ recordId: statusId, deletedAt });
  await upsertDeletion({ recordId: markId, deletedAt });

  const states = await getAllInboxStates();
  for (const state of states) {
    const parsed = parseInboxRecordId(state.recordId);
    if (
      parsed?.kind === "rel" &&
      (parsed.sourceId === targetId || parsed.targetId === targetId)
    ) {
      await upsertDeletion({ recordId: state.recordId, deletedAt });
      await deleteInboxState(state.recordId);
    }
  }
  await deleteInboxState(statusId);
  await deleteInboxState(markId);
}
