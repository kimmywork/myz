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
import { withStore } from "@myz/shared/idb";
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

function toIndex(snapshot: PageSnapshot): PageSnapshotIndex {
  return {
    id: snapshot.id,
    recordId: snapshot.recordId,
    url: snapshot.url,
    title: snapshot.title,
    bytes: snapshot.bytes,
    createdAt: snapshot.createdAt,
    usedAt: snapshot.usedAt,
  };
}

/** Index of every stored snapshot, cheap enough to compute per write. */
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

/** Newest first, for the viewer. */
export async function getSnapshotForRecord(
  recordId: string,
): Promise<PageSnapshot | undefined> {
  const all = await getAllFromStore<PageSnapshot>(STORE);
  return all
    .filter((snapshot) => snapshot.recordId === recordId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export async function snapshotUsageBytes(): Promise<number> {
  return usedBytes(await listSnapshotIndex());
}

/**
 * Marks a snapshot as used, so LRU keeps what the user actually reads.
 *
 * Best-effort: a failed touch only affects future eviction order.
 */
export async function touchSnapshot(id: string): Promise<void> {
  try {
    const snapshot = await getSnapshot(id);
    if (!snapshot) return;
    const db = await getDB();
    await withStore<void>(db, STORE, "readwrite", (store) =>
      store.put({ ...snapshot, usedAt: new Date().toISOString() }),
    );
  } catch (error) {
    console.warn("[myz:snapshot] failed to touch snapshot", error);
  }
}

async function deleteSnapshots(ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  const db = await getDB();
  await withStore<void>(db, STORE, "readwrite", (store) => {
    ids.forEach((id) => store.delete(id));
    return store.count();
  });
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
export async function saveSnapshot(
  input: Omit<PageSnapshot, "bytes" | "createdAt" | "usedAt"> & {
    bytes: number;
    createdAt?: string;
    usedAt?: string;
  },
): Promise<SaveSnapshotResult> {
  if (input.bytes > SNAPSHOT_MAX_BYTES) {
    throw new SnapshotWriteError(
      "too-large",
      `快照过大（${Math.round(input.bytes / 1024)} KB）`,
    );
  }

  const index = await listSnapshotIndex();
  const others = index.filter((entry) => entry.id !== input.id);
  const plan = planEviction(others, input.bytes, SNAPSHOT_QUOTA_BYTES);
  if (!plan.fits) {
    throw new SnapshotWriteError("no-room", "空间不足，无法保存快照");
  }

  const now = new Date().toISOString();
  const snapshot: PageSnapshot = {
    ...input,
    bytes: input.bytes,
    createdAt: input.createdAt ?? now,
    usedAt: input.usedAt ?? now,
  };

  try {
    // Evict first: the new record is already known to fit afterwards.
    await deleteSnapshots(plan.evict);
    const db = await getDB();
    // One put = one record; a failure leaves nothing half-written.
    await withStore<void>(db, STORE, "readwrite", (store) =>
      store.put(snapshot),
    );
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
