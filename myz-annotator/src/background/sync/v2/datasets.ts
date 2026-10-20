import { parseRecordId, recordIdForHighlight } from "@myz/core/identity";
import { recordCodecs, resolveRecordSchemaId } from "@myz/core/record-codecs";
import { ensureRecordSchemaVersion, type MyZRecord } from "@myz/shared/types";
import type { StreamDataset } from "@myz/sync-core/accountSync";
import type { StreamRemoteRecord } from "@myz/sync-core/streamClient";
import { recordsStore } from "../../stores";
import { listDeletions, removeDeletion } from "../storage";

const STREAM_ID = "highlights";

/** Materialized highlights plus opaque records not shadowed by one. */
async function collectHighlights() {
  const [highlights, opaque] = await Promise.all([
    recordsStore.listAll(),
    recordsStore.listOpaque(STREAM_ID),
  ]);
  const materialized = highlights.map((highlight) => ({
    recordId: recordIdForHighlight(highlight.id),
    updatedAt: highlight.updatedAt || highlight.createdAt,
    data: highlight as unknown,
  }));
  // A record can briefly exist in both tables (malformed update for an
  // already-materialized record). Materialized wins so the stream never
  // carries two entries with the same recordId.
  const materializedIds = new Set(
    materialized.map((record) => record.recordId),
  );
  const preserved = opaque
    .filter((record) => !materializedIds.has(record.recordId))
    .map((record) => ({
      recordId: record.recordId,
      updatedAt: record.updatedAt,
      data: record.data,
    }));
  return [...materialized, ...preserved];
}

/** Materialize a valid highlight, or preserve the payload opaquely. */
async function applyHighlightRecord(record: StreamRemoteRecord): Promise<void> {
  const parsed = parseRecordId(record.recordId);
  const data = record.data as Partial<MyZRecord> | null | undefined;
  const schemaId = resolveRecordSchemaId(data);
  const codec = recordCodecs.get(schemaId);
  // Materialize only when the id prefix, payload id, schema discriminator AND
  // the payload itself all agree. Unknown or malformed payloads stay opaque so
  // a newer/broken client cannot corrupt the local store.
  if (
    parsed?.kind === "highlight" &&
    data &&
    typeof data === "object" &&
    data.id === parsed.id &&
    codec
  ) {
    let materialized: MyZRecord | null = null;
    try {
      const candidate = ensureRecordSchemaVersion(data as MyZRecord);
      materialized = recordCodecs.parse<MyZRecord>(
        schemaId,
        candidate,
        codec.currentVersion,
      );
    } catch {
      // Malformed payload for a known schema: preserve it opaquely. Only parse
      // errors are caught here — storage failures must propagate.
    }
    if (materialized) {
      await recordsStore.upsert({
        ...materialized,
        updatedAt: record.updatedAt,
      });
      // A valid update supersedes any stale opaque copy of this record.
      await recordsStore.deleteOpaque(STREAM_ID, record.recordId);
      return;
    }
  }
  await recordsStore.putOpaque({
    streamId: STREAM_ID,
    recordId: record.recordId,
    updatedAt: record.updatedAt,
    data: record.data,
  });
}

/**
 * The main (highlight) stream dataset (recordId `h:<id>`).
 *
 * Records we cannot materialize (unknown record-id prefix / future `schemaId`
 * / malformed payload) are not dropped: `apply` stores them verbatim in the
 * opaque overflow and `collect` hands them back, so a newer client's record
 * survives on this (older) client (D1).
 */
export function createHighlightDataset(): StreamDataset {
  return {
    streamId: STREAM_ID,
    collect: collectHighlights,
    apply: applyHighlightRecord,
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
