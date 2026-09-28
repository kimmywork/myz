import { parseInboxRecordId } from "@myz/shared/inbox";
import type { StreamDataset } from "@myz/sync-core/accountSync";
import {
  deleteInboxState,
  getAllInboxStates,
  putInboxState,
} from "../../storage";

/**
 * Inbox workflow metadata stream (`status:` / `mark:` / `rel:` records).
 * Physically isolated from the highlight stream so status writes never
 * overwrite body/annotation edits.
 */
export function createInboxDataset(): StreamDataset {
  return {
    streamId: "inbox",
    async collect() {
      const records = await getAllInboxStates();
      return records.map((record) => ({
        recordId: record.recordId,
        updatedAt: record.changedAt,
        data: { kind: record.kind, ...(record.payload as object) },
      }));
    },
    async apply(record) {
      const parsed = parseInboxRecordId(record.recordId);
      if (!parsed) return;
      const payload = record.data as Record<string, unknown>;
      await putInboxState({
        recordId: record.recordId,
        kind: parsed.kind,
        changedAt: record.updatedAt,
        payload,
      });
    },
    async remove(recordId) {
      await deleteInboxState(recordId);
    },
  };
}
