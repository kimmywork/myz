/**
 * Page-snapshot store (I8).
 *
 * Its own IndexedDB store with its own LRU + quota, deliberately separate from
 * the capture cache: images are user-captured bytes, snapshots are page
 * structure kept until space runs out, and one eviction rule cannot serve both.
 *
 * Writes are all-or-nothing: the payload goes in as one record, so a failure
 * cannot leave a half snapshot behind, and eviction happens only after the new
 * record is known to fit.
 */
import {
  SNAPSHOT_MAX_BYTES,
  SNAPSHOT_QUOTA_BYTES,
  planEviction,
  usedBytes,
  type PageSnapshot,
  type PageSnapshotIndex,
} from "@myz/core/page-snapshot";
import { canonicalSnapshotUrl } from "@myz/core/snapshot-versions";
import { inTransaction, withStore } from "@myz/shared/idb";
import { getAllFromStore, getDB } from "./storage.js";

const STORE = "page_snapshots";

/** Thrown when a snapshot cannot be stored; the caller must surface it. */
export class SnapshotWriteError extends Error {
  readonly reason: "too-large" | "no-room" | "write-failed";

  constructor(
    reason: "too-large" | "no-room" | "write-failed",
    message: string,
  ) {
    super(message);
    this.name = "SnapshotWriteError";
    this.reason = reason;
  }
}

/** UTF-8 size of what is actually stored, not what the caller claims. */
export function measureSnapshotBytes(html: string, css: string): number {
  const encoder = new TextEncoder();
  return encoder.encode(html).length + encoder.encode(css).length;
}

function toIndex(snapshot: PageSnapshot): PageSnapshotIndex {
  return {
    id: snapshot.id,
    url: snapshot.url,
    title: snapshot.title,
    bytes: snapshot.bytes,
    createdAt: snapshot.createdAt,
    usedAt: snapshot.usedAt,
  };
}

/**
 * Index of every stored snapshot.
 *
 * **This is a full scan**: IndexedDB cursors return whole records, so summing
 * `bytes` necessarily loads every body (up to the quota, 80 MB) into memory.
 * Called on each save and whenever the viewer asks for usage. Fine at the
 * current scale; if snapshots grow into the hundreds this is the first thing to
 * change (a maintained counter record), at the cost of a second source of
 * truth that could drift.
 */
export async function listSnapshotIndex(): Promise<PageSnapshotIndex[]> {
  const all = await getAllFromStore<PageSnapshot>(STORE);
  return all.map(toIndex);
}

export async function getSnapshot(
  id: string,
): Promise<PageSnapshot | undefined> {
  const db = await getDB();
  return withStore<PageSnapshot | undefined>(db, STORE, "readonly", (store) =>
    store.get(id),
  );
}

/**
 * Every snapshot of the page at `url`, newest first.
 *
 * Snapshots are page-bound (2026-11-23): all records of a page anchor onto the
 * same copy. Uses the canonical URL so `?utm_source=…`, a fragment or a video
 * timestamp does not look like a different page. All snapshots are scanned:
 * grouping is rare (only when the viewer opens) and needs the whole set anyway.
 *
 * Since 2026-11-24 a page keeps exactly one copy — saving replaces — so in
 * practice this list has a single entry; the shape stays for the read-side
 * pruning of pre-replacement stores.
 */
export async function getSnapshotVersions(
  url: string,
): Promise<PageSnapshot[]> {
  const key = canonicalSnapshotUrl(url);
  const all = await getAllFromStore<PageSnapshot>(STORE);
  return all
    .filter((snapshot) => canonicalSnapshotUrl(snapshot.url) === key)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function snapshotUsageBytes(): Promise<number> {
  return usedBytes(await listSnapshotIndex());
}

/** Deletes snapshots by id (one transaction). */
export async function deleteSnapshots(ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDB();
  await inTransaction(db, STORE, "readwrite", (tx) => {
    const store = tx.objectStore(STORE);
    ids.forEach((id) => store.delete(id));
  });
}

/**
 * Marks a snapshot as used, so LRU keeps what the user actually reads.
 *
 * Best-effort: a failed touch only affects future eviction order. The read and
 * the write share one transaction: a plain read-then-put could resurrect a
 * snapshot that a replacement deleted in between, breaking the one-copy rule
 * (CodeRabbit #136). Readwrite transactions on the same store are serialised,
 * so either the replacement committed first (nothing to touch) or this write
 * goes first and its delete follows.
 */
export async function touchSnapshot(id: string): Promise<void> {
  try {
    const db = await getDB();
    const usedAt = new Date().toISOString();
    await inTransaction(db, STORE, "readwrite", (tx) => {
      const store = tx.objectStore(STORE);
      const request = store.get(id);
      request.onsuccess = () => {
        const snapshot = request.result as PageSnapshot | undefined;
        if (!snapshot) return;
        store.put({ ...snapshot, usedAt });
      };
    });
  } catch (error) {
    console.warn("[myz:snapshot] failed to touch snapshot", error);
  }
}

export interface SaveSnapshotResult {
  saved: PageSnapshot;
  /** Ids evicted to make room; empty when there was room. */
  evicted: string[];
}

/**
 * Stores one snapshot, evicting least-recently-used entries if needed.
 *
 * @throws {@link SnapshotWriteError} when the snapshot is too large, cannot fit
 *   even after evicting everything, or the write itself fails. The caller must
 *   show it: a snapshot the user believes in but does not have is worse than
 *   no snapshot.
 */
/**
 * One save at a time. The eviction plan is computed from an index read that a
 * concurrent save (two tabs, a double click) would invalidate: both would plan
 * against the same old copy, each would write its own record, and the page
 * would end up with two copies plus a quota plan that never counted the other
 * write (CodeRabbit #136). A failed save must not block the next one, so the
 * chain swallows rejections of the tail only.
 */
let saveTail: Promise<unknown> = Promise.resolve();

function serializeSave<T>(task: () => Promise<T>): Promise<T> {
  const run = saveTail.then(task, task);
  saveTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function saveSnapshot(
  input: Omit<PageSnapshot, "bytes" | "createdAt" | "usedAt"> & {
    createdAt?: string;
    usedAt?: string;
  },
  limits: { quota?: number; maxBytes?: number } = {},
): Promise<SaveSnapshotResult> {
  return serializeSave(() => saveSnapshotNow(input, limits));
}

async function saveSnapshotNow(
  input: Omit<PageSnapshot, "bytes" | "createdAt" | "usedAt"> & {
    createdAt?: string;
    usedAt?: string;
  },
  limits: { quota?: number; maxBytes?: number },
): Promise<SaveSnapshotResult> {
  const quota = limits.quota ?? SNAPSHOT_QUOTA_BYTES;
  const maxBytes = limits.maxBytes ?? SNAPSHOT_MAX_BYTES;
  // Never trust a caller-supplied size: a payload with a small `bytes` and a
  // large `html` would slip past both the per-snapshot cap and the quota plan
  // and make the stored usage lie. Measure what is actually being written.
  const bytes = measureSnapshotBytes(input.html, input.css);
  if (bytes > maxBytes) {
    throw new SnapshotWriteError(
      "too-large",
      `快照过大（${Math.round(bytes / 1024)} KB）`,
    );
  }

  const index = await listSnapshotIndex();
  // 2026-11-24：一页只保留最新版本——同页旧版本随本次保存一起替换，它们
  // 释放的额度算进本次保存的可用空间（不占 LRU 驱逐名额）。
  const pageKey = canonicalSnapshotUrl(input.url);
  const replacedIds = new Set(
    index
      .filter(
        (entry) =>
          entry.id !== input.id && canonicalSnapshotUrl(entry.url) === pageKey,
      )
      .map((entry) => entry.id),
  );
  const others = index.filter(
    (entry) => entry.id !== input.id && !replacedIds.has(entry.id),
  );
  const plan = planEviction(others, bytes, quota);
  if (!plan.fits) {
    throw new SnapshotWriteError("no-room", "空间不足，无法保存快照");
  }

  const now = new Date().toISOString();
  const snapshot: PageSnapshot = {
    ...input,
    bytes,
    createdAt: input.createdAt ?? now,
    usedAt: input.usedAt ?? now,
  };

  try {
    const db = await getDB();
    // Replacement, eviction and the new record share one transaction: if the
    // write fails, nothing is lost — no half snapshot, and the previous
    // version stays.
    await inTransaction(db, STORE, "readwrite", (tx) => {
      const store = tx.objectStore(STORE);
      replacedIds.forEach((id) => store.delete(id));
      plan.evict.forEach((id) => store.delete(id));
      store.put(snapshot);
    });
  } catch (error) {
    throw new SnapshotWriteError(
      "write-failed",
      `快照写入失败：${(error as Error).message}`,
    );
  }

  return { saved: snapshot, evicted: plan.evict };
}

/**
 * Sessions in which the user has already been told that snapshots are being
 * evicted. "Once per session" is the agreed cadence: every eviction would nag,
 * never would hide that their pages are disappearing.
 */
let evictionNoticeShown = false;

export function shouldAnnounceEviction(): boolean {
  if (evictionNoticeShown) return false;
  evictionNoticeShown = true;
  return true;
}

/** Test hook: forget the once-per-session notice. */
export function resetEvictionNotice(): void {
  evictionNoticeShown = false;
}
