/**
 * Page snapshots (I8) — a local copy of the page body behind a record.
 *
 * A snapshot is *structure*, not pixels: the article's text markup plus one
 * small controlled stylesheet, with scripts and image payloads stripped. It is
 * deliberately a different store from the capture cache (`staged_assets`):
 * images are bytes the user captured, snapshots are page structure kept until
 * space runs out, and they must not share an eviction rule.
 *
 * Everything here is pure: deciding what to evict is arithmetic on the stored
 * index, so it can be tested without IndexedDB.
 */

/** One stored snapshot. */
export interface PageSnapshot {
  id: string;
  /** Record the snapshot was taken around, when it was taken from a record. */
  recordId?: string;
  url: string;
  title: string;
  /** Body markup with scripts, media and layout classes stripped. */
  html: string;
  /** The fixed stylesheet every snapshot shares. */
  css: string;
  /** Byte size of `html + css`, measured when it was written. */
  bytes: number;
  createdAt: string;
  /** Last read; LRU eviction orders by this. */
  usedAt: string;
}

/** Index entry kept in memory for quota decisions (no payload). */
export type PageSnapshotIndex = Pick<
  PageSnapshot,
  "id" | "recordId" | "url" | "title" | "bytes" | "createdAt" | "usedAt"
>;

/**
 * Total space the snapshots may occupy.
 *
 * Measured basis (see `scripts/measure/snapshot-size.mjs`): static article
 * pages produce 72–211 KB of structure, median ≈ 122 KB. 80 MB holds ~660
 * median pages, or ~400 long ones. The sample was static-rendered pages only —
 * the JS-rendered sites could not be measured offline and are usually larger —
 * so this is a *budget from a low sample*, not a measured ceiling. The real
 * safety net is LRU eviction below.
 */
export const SNAPSHOT_QUOTA_BYTES = 80 * 1024 * 1024;

/**
 * Largest single snapshot.
 *
 * One runaway page must not be able to evict the whole cache: a snapshot over
 * an eighth of the quota is rejected instead of prompting a mass eviction.
 */
export const SNAPSHOT_MAX_BYTES = SNAPSHOT_QUOTA_BYTES / 8;

export interface EvictionPlan {
  /** Ids to delete, oldest use first. */
  evict: string[];
  /** Whether the incoming snapshot fits once those are gone. */
  fits: boolean;
}

/**
 * Decides what must go to make room for `incomingBytes`.
 *
 * Evicts by least-recent use, and only as much as needed. Refuses a snapshot
 * larger than {@link SNAPSHOT_MAX_BYTES} outright — accepting it would wipe
 * most of the cache for one page.
 */
export function planEviction(
  existing: readonly PageSnapshotIndex[],
  incomingBytes: number,
  quota: number = SNAPSHOT_QUOTA_BYTES,
): EvictionPlan {
  if (incomingBytes > SNAPSHOT_MAX_BYTES) {
    return { evict: [], fits: false };
  }
  const used = existing.reduce((sum, entry) => sum + entry.bytes, 0);
  let remaining = used + incomingBytes - quota;
  if (remaining <= 0) return { evict: [], fits: true };

  const oldestFirst = [...existing].sort((a, b) =>
    a.usedAt.localeCompare(b.usedAt),
  );
  const evict: string[] = [];
  for (const entry of oldestFirst) {
    if (remaining <= 0) break;
    evict.push(entry.id);
    remaining -= entry.bytes;
  }
  return { evict, fits: remaining <= 0 };
}

/** Total bytes the index occupies. */
export function usedBytes(existing: readonly PageSnapshotIndex[]): number {
  return existing.reduce((sum, entry) => sum + entry.bytes, 0);
}

/** `12.3 MB` for the read-only status line. */
export function formatSnapshotUsage(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 10) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1)} MB`;
}

/**
 * The one-line status the viewer shows. Wording is fixed by the contract:
 * "本机快照 · 占用 X MB · 空间不足时最旧的会被清理".
 */
export function snapshotStatusLine(bytes: number): string {
  return `本机快照 · 占用 ${formatSnapshotUsage(bytes)} · 空间不足时最旧的会被清理`;
}
