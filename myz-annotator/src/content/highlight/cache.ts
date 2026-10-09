import { isClipRecord } from "@myz/shared/highlightUtils";
import type { MyZRecord } from "@myz/shared/types";
import { normalizeRecord } from "@/dashboard/utils/records.ts";

/** Live highlight records keyed by id, mirrored from the background store. */
export const highlightCache = new Map<string, MyZRecord>();
/** Ids whose stored range could not be relocated (page content changed). */
export const unreachableHighlights = new Set<string>();

export function isInHighlightCache(id: string) {
  return highlightCache.has(id);
}

export function storeRecord(record: MyZRecord) {
  if (!record || !record.id) return null;
  const normalized = normalizeRecord(record)!;
  highlightCache.set(normalized.id, normalized);
  return normalized;
}

export function getFromHighlightCache(id?: string) {
  if (!id) return undefined;
  return highlightCache.get(id);
}

export function getHighlightCache() {
  return highlightCache;
}

export function deleteUnreachableHighlights(id: string) {
  if (!id && !unreachableHighlights.has(id)) return;
  unreachableHighlights.delete(id);
}

export function clearHighlightCaches() {
  highlightCache.clear();
  unreachableHighlights.clear();
}

export function computeHighlightStats() {
  let highlightCount = 0;
  let savedCount = 0;
  highlightCache.forEach((record) => {
    if (isClipRecord(record)) savedCount += 1;
    else highlightCount += 1;
  });
  return { highlightCount, savedCount, total: highlightCount + savedCount };
}

export function buildHighlightStateSnapshot() {
  const unreachable = Array.from(unreachableHighlights).filter((id) =>
    highlightCache.has(id),
  );
  if (unreachable.length !== unreachableHighlights.size) {
    unreachableHighlights.clear();
    unreachable.forEach((id) => unreachableHighlights.add(id));
  }
  const stats = computeHighlightStats();
  return {
    count: stats.total,
    total: stats.total,
    highlightCount: stats.highlightCount,
    savedCount: stats.savedCount,
    unreachableIds: unreachable,
    unreachableCount: unreachable.length,
  };
}
