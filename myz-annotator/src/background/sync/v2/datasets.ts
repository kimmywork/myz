import { parseRecordId, recordIdForHighlight } from "@myz/core/identity";
import type { MyZRecord } from "@myz/shared/types";
import type { StreamDataset } from "@myz/sync-core/accountSync";
import { recordsStore } from "../../stores";
import { listDeletions, removeDeletion } from "../storage";

const STREAM_ID = "highlights";

/**
 * The main (highlight) stream dataset (recordId `h:<id>`).
 *
 * Records we cannot materialize (unknown record-id prefix / future `schemaId`)
 * are not dropped: `apply` stores them verbatim in the opaque overflow and
 * `collect` hands them back, so a newer client's record survives on this
 * (older) client (D1).
 */
export function createHighlightDataset(): StreamDataset {
  return {
    streamId: STREAM_ID,
    async collect() {
      const [highlights, opaque] = await Promise.all([
        recordsStore.listAll(),
        recordsStore.listOpaque(STREAM_ID),
      ]);
      const materialized = highlights.map((highlight) => ({
        recordId: recordIdForHighlight(highlight.id),
        updatedAt: highlight.updatedAt || highlight.createdAt,
        data: highlight as unknown,
      }));
      const preserved = opaque.map((record) => ({
        recordId: record.recordId,
        updatedAt: record.updatedAt,
        data: record.data,
      }));
      return [...materialized, ...preserved];
    },
    async apply(record) {
      const parsed = parseRecordId(record.recordId);
      const data = record.data as Partial<MyZRecord> | null | undefined;
      // Only materialize when the record id AND payload agree (a future
      // highlight schema, or a payload whose id differs, stays opaque).
      const isHighlight =
        parsed?.kind === "highlight" &&
        !!data &&
        typeof data === "object" &&
        data.id === parsed.id;
      if (isHighlight) {
        await recordsStore.upsert({
          ...(data as MyZRecord),
          updatedAt: record.updatedAt,
        });
        return;
      }
      await recordsStore.putOpaque({
        streamId: STREAM_ID,
        recordId: record.recordId,
        updatedAt: record.updatedAt,
        data: record.data,
      });
    },
    async remove(recordId) {
      const parsed = parseRecordId(recordId);
      if (parsed?.kind === "highlight") {
        await recordsStore.remove(parsed.id);
      }
      // An `h:` record can also live in the opaque overflow (its payload was
      // unknown / id-mismatched), so clear that entry too or it would
      // resurrect on the next collect.
      await recordsStore.deleteOpaque(STREAM_ID, recordId);
    },
    async collectTombstones() {
      const deletions = await listDeletions();
      const tombstones: Record<string, string> = {};
      for (const deletion of deletions) {
        if (deletion.recordId.startsWith("h:")) {
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
