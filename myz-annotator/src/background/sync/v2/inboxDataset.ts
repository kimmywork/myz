import { parseInboxRecordId } from "@myz/shared/inbox";
import type { StreamDataset } from "@myz/sync-core/accountSync";
import { inboxStateStore, recordsStore } from "../../stores";
import { listDeletions, removeDeletion } from "../storage";

const STREAM_ID = "inbox";

/**
 * Inbox workflow metadata stream (`status:` / `mark:` / `rel:` records).
 * Physically isolated from the highlight stream so status writes never
 * overwrite body/annotation edits. Unknown records are preserved opaquely
 * (D1) rather than dropped.
 */
export function createInboxDataset(): StreamDataset {
  return {
    streamId: STREAM_ID,
    async collect() {
      const [states, opaque] = await Promise.all([
        inboxStateStore.listAll(),
        recordsStore.listOpaque(STREAM_ID),
      ]);
      const materialized = states.map((state) => ({
        recordId: state.recordId,
        updatedAt: state.changedAt,
        data: { kind: state.kind, ...(state.payload as object) } as unknown,
      }));
      const preserved = opaque.map((record) => ({
        recordId: record.recordId,
        updatedAt: record.updatedAt,
        data: record.data,
      }));
      return [...materialized, ...preserved];
    },
    async apply(record) {
      const parsed = parseInboxRecordId(record.recordId);
      if (!parsed) {
        await recordsStore.putOpaque({
          streamId: STREAM_ID,
          recordId: record.recordId,
          updatedAt: record.updatedAt,
          data: record.data,
        });
        return;
      }
      const payload = record.data as Record<string, unknown>;
      await inboxStateStore.put({
        recordId: record.recordId,
        kind: parsed.kind,
        changedAt: record.updatedAt,
        payload,
      });
    },
    async remove(recordId) {
      if (parseInboxRecordId(recordId)) {
        await inboxStateStore.remove(recordId);
        return;
      }
      await recordsStore.deleteOpaque(recordId);
    },
    async collectTombstones() {
      const deletions = await listDeletions();
      const tombstones: Record<string, string> = {};
      for (const deletion of deletions) {
        if (
          deletion.recordId.startsWith("status:") ||
          deletion.recordId.startsWith("mark:") ||
          deletion.recordId.startsWith("rel:")
        ) {
          tombstones[deletion.recordId] = deletion.deletedAt;
        }
      }
      return tombstones;
    },
    async clearTombstones(ids) {
      for (const recordId of ids) {
        await removeDeletion(recordId);
      }
    },
  };
}
