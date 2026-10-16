import { inboxRelationRecordId, parseInboxRecordId } from "@myz/shared/inbox";

/**
 * Relation model: a directed edge between two records. Reuses the inbox `rel:`
 * record-id scheme (per-edge records, existence means "related") so backlinks
 * build on the same substrate instead of a second mechanism.
 */
export interface Relation {
  sourceId: string;
  targetId: string;
}

/** Stable record id for a directed relation edge. */
export function relationRecordId(relation: Relation): string {
  return inboxRelationRecordId(relation.sourceId, relation.targetId);
}

/** Parse a `rel:` record id back into a relation, or `null`. */
export function parseRelationRecordId(recordId: string): Relation | null {
  const parsed = parseInboxRecordId(recordId);
  return parsed?.kind === "rel"
    ? { sourceId: parsed.sourceId, targetId: parsed.targetId }
    : null;
}

/** Inbound edges: records that point at `targetId`. */
export function backlinksOf(
  relations: readonly Relation[],
  targetId: string,
): Relation[] {
  return relations.filter((relation) => relation.targetId === targetId);
}
