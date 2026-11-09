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

/** Storage/restore callbacks plus optional lifecycle listeners. */
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

/** Owns one deferred delete timer per record. */
export interface PendingDeleteController {
  /** Holds the delete of `record` for the undo window. */
  schedule: (record: MyZRecord) => void;
  /** Cancels the pending delete and restores the record. Idempotent. */
  undo: (id: string) => boolean;
  /**
   * Freezes the commit countdown (the undo toast is hovered or focused), so a
   * slow reader cannot lose the record while the button is still on screen.
   */
  pause: (id: string) => void;
  /** Resumes the commit countdown where {@link pause} left it. */
  resume: (id: string) => void;
  has: (id: string) => boolean;
  /** Clears every pending timer without committing (host teardown). */
  dispose: () => void;
}

interface PendingEntry {
  record: MyZRecord;
  timer: ReturnType<typeof setTimeout> | null;
  /** Milliseconds left before the commit fires while the entry is paused. */
  remaining: number;
  /** When the running countdown started; used by pause/resume. */
  startedAt: number;
}

/** Writes one deferred delete, restoring the DOM when the write fails. */
async function runCommit(record: MyZRecord, deps: PendingDeleteDeps) {
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

/**
 * Creates the controller that owns one deferred delete timer per record.
 *
 * @param deps Storage/restore callbacks and optional lifecycle listeners.
 * @returns A controller whose timers can be paused with the toast.
 */
export function createPendingDelete(
  deps: PendingDeleteDeps,
): PendingDeleteController {
  const windowMs = deps.windowMs ?? PENDING_DELETE_WINDOW_MS;
  const pending = new Map<string, PendingEntry>();

  function arm(id: string, entry: PendingEntry, delay: number) {
    entry.startedAt = Date.now();
    entry.remaining = delay;
    entry.timer = setTimeout(() => {
      const current = pending.get(id);
      if (!current) return;
      pending.delete(id);
      current.timer = null;
      void runCommit(current.record, deps);
    }, delay);
  }

  function schedule(record: MyZRecord) {
    if (!record.id || pending.has(record.id)) return;
    const entry: PendingEntry = {
      record,
      timer: null,
      remaining: windowMs,
      startedAt: 0,
    };
    pending.set(record.id, entry);
    arm(record.id, entry, windowMs);
  }

  function pause(id: string) {
    const entry = pending.get(id);
    if (!entry?.timer) return;
    clearTimeout(entry.timer);
    entry.timer = null;
    entry.remaining = Math.max(
      0,
      entry.remaining - (Date.now() - entry.startedAt),
    );
  }

  function resume(id: string) {
    const entry = pending.get(id);
    if (!entry || entry.timer) return;
    arm(id, entry, entry.remaining);
  }

  function undo(id: string) {
    const entry = pending.get(id);
    if (!entry) return false;
    if (entry.timer) clearTimeout(entry.timer);
    pending.delete(id);
    const restored = deps.restore(entry.record);
    deps.onUndone?.(entry.record, restored);
    return true;
  }

  function dispose() {
    pending.forEach((entry) => {
      if (entry.timer) clearTimeout(entry.timer);
    });
    pending.clear();
  }

  return {
    schedule,
    undo,
    pause,
    resume,
    has: (id) => pending.has(id),
    dispose,
  };
}
