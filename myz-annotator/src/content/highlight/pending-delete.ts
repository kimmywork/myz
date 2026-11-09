/**
 * Deferred highlight deletion for the content inspector.
 *
 * Confirming a delete only takes the record out of the live DOM; the storage
 * write is held for a short window so the user can undo it from the toast.
 * Undo therefore never needs to re-create anything in storage — nothing was
 * deleted yet. When the window expires the write is committed; a failed write
 * restores the DOM so the page and the store stay in sync.
 *
 * Kept free of DOM, Vue and messaging so the timing rules can be unit-tested
 * with fake timers; callers inject `commit` and `restore`.
 */
import type { MyZRecord } from "@myz/shared/types";

/** How long the undo toast stays actionable — and the deferred write window. */
export const PENDING_DELETE_WINDOW_MS = 6000;

export interface PendingDeleteDeps {
  /** Persists the delete. Resolves `false` when the write failed. */
  commit: (id: string) => Promise<boolean>;
  /** Puts the record back into the live DOM; `false` when it cannot. */
  restore: (record: MyZRecord) => boolean;
  /** Override for tests; defaults to {@link PENDING_DELETE_WINDOW_MS}. */
  windowMs?: number;
  onCommitted?: (record: MyZRecord) => void;
  onCommitFailed?: (record: MyZRecord, restored: boolean) => void;
  onUndone?: (record: MyZRecord, restored: boolean) => void;
}

export interface PendingDeleteController {
  /** Holds the delete of `record` for the undo window. */
  schedule: (record: MyZRecord) => void;
  /** Cancels the pending delete and restores the record. Idempotent. */
  undo: (id: string) => boolean;
  has: (id: string) => boolean;
  /** Clears every pending timer without committing (host teardown). */
  dispose: () => void;
}

interface PendingEntry {
  record: MyZRecord;
  timer: ReturnType<typeof setTimeout>;
}

export function createPendingDelete(
  deps: PendingDeleteDeps,
): PendingDeleteController {
  const windowMs = deps.windowMs ?? PENDING_DELETE_WINDOW_MS;
  const pending = new Map<string, PendingEntry>();

  async function commitEntry(entry: PendingEntry) {
    const { record } = entry;
    let committed = false;
    try {
      committed = await deps.commit(record.id);
    } catch {
      committed = false;
    }
    if (committed) {
      deps.onCommitted?.(record);
      return;
    }
    // The record never left storage, so putting it back in the DOM is enough.
    const restored = deps.restore(record);
    deps.onCommitFailed?.(record, restored);
  }

  function schedule(record: MyZRecord) {
    if (!record.id || pending.has(record.id)) return;
    const timer = setTimeout(() => {
      const entry = pending.get(record.id);
      if (!entry) return;
      pending.delete(record.id);
      void commitEntry(entry);
    }, windowMs);
    pending.set(record.id, { record, timer });
  }

  function undo(id: string) {
    const entry = pending.get(id);
    if (!entry) return false;
    clearTimeout(entry.timer);
    pending.delete(id);
    const restored = deps.restore(entry.record);
    deps.onUndone?.(entry.record, restored);
    return true;
  }

  function dispose() {
    pending.forEach((entry) => clearTimeout(entry.timer));
    pending.clear();
  }

  return {
    schedule,
    undo,
    has: (id) => pending.has(id),
    dispose,
  };
}
