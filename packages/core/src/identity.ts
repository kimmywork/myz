/**
 * Record identity: the stable `id` ↔ synced `recordId` prefix mapping.
 *
 * Synced record ids carry a kind prefix (`h:<id>` for highlights today) so one
 * sync stream can hold heterogeneous record kinds. This is frozen domain
 * vocabulary (see `docs/plan/core-refactor.md` §4.1): a new record kind adds a
 * prefix here and nowhere else.
 */

export const RECORD_ID_KINDS = ["highlight"] as const;

export type RecordIdKind = (typeof RECORD_ID_KINDS)[number];

const PREFIX_BY_KIND: Record<RecordIdKind, string> = {
  highlight: "h:",
};

const KIND_BY_PREFIX: ReadonlyArray<readonly [string, RecordIdKind]> = [
  ["h:", "highlight"],
];

/** Build a synced record id from a kind and a local record id. */
export function recordIdFor(kind: RecordIdKind, id: string): string {
  return `${PREFIX_BY_KIND[kind]}${id}`;
}

/** Highlight records live in the main stream under `h:<id>`. */
export function recordIdForHighlight(id: string): string {
  return recordIdFor("highlight", id);
}

/** Split a synced record id into its kind and local id, or `null` if unknown. */
export function parseRecordId(
  recordId: string,
): { kind: RecordIdKind; id: string } | null {
  for (const [prefix, kind] of KIND_BY_PREFIX) {
    if (recordId.startsWith(prefix)) {
      return { kind, id: recordId.slice(prefix.length) };
    }
  }
  return null;
}
