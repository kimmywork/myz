/**
 * Durable intent journal for deferred deletes (§4.30).
 *
 * The undo window keeps storage untouched, so a page that dies mid-window must
 * not lose the delete. The UI persists an intent here *before* it removes the
 * rows; the background commits it when the window ends, and drains overdue
 * intents on startup / alarm so closing the page still deletes the records.
 *
 * Every read-modify-write runs on one serial chain: two deletes arriving in the
 * same tick must both keep their intent instead of overwriting each other.
 * A missing intent is never treated as success on its own — storage is checked
 * first, and a cancelled intent is distinguishable from a lost one.
 */
export interface DeleteJournalEntry {
  ids: string[];
  dueAt: number;
  /** The user undid this intent; a late commit must not delete the records. */
  cancelled?: boolean;
}

export interface DeleteJournalDeps {
  read: () => Promise<DeleteJournalEntry[]>;
  write: (entries: DeleteJournalEntry[]) => Promise<void>;
  /** Removes the records in one transaction (batch atomicity). */
  removeRecords: (ids: string[]) => Promise<void>;
  /** Records the sync deletion tombstone. */
  recordDeletion: (id: string) => Promise<void>;
  /** True when at least one of these records still exists in storage. */
  anyPresent: (ids: readonly string[]) => Promise<boolean>;
  /** Removes tombstones when an intent is cancelled (undo). */
  clearDeletions: (ids: readonly string[]) => Promise<void>;
  /** Reports a tombstone that is still pending after a failed write. */
  onTombstoneFailure?: (ids: readonly string[]) => void;
  now?: () => number;
}

export interface DeleteJournal {
  queue: (ids: readonly string[], dueAt: number) => Promise<boolean>;
  /** Marks the intent cancelled; `false` when it was already committed. */
  cancel: (ids: readonly string[]) => Promise<boolean>;
  commit: (ids: readonly string[]) => Promise<boolean>;
  pendingIds: () => Promise<string[]>;
  drainExpired: () => Promise<void>;
}

/** How long a cancelled marker is kept to make late commits no-ops. */
const CANCELLED_TTL_MS = 60_000;

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((id, index) => id === sortedRight[index]);
}

interface DeleteOutcome {
  removed: boolean;
  tombstonesPending: boolean;
}

/**
 * Creates the journal over injected storage and record ports.
 *
 * @param deps Persistence, presence check and deletion ports.
 * @returns The journal API used by message handlers and the drain alarm.
 */
export function createDeleteJournal(deps: DeleteJournalDeps): DeleteJournal {
  const now = deps.now ?? (() => Date.now());

  let tail: Promise<unknown> = Promise.resolve();
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function queueImpl(
    ids: readonly string[],
    dueAt: number,
  ): Promise<boolean> {
    if (!ids.length) return true;
    try {
      const entries = await deps.read();
      const next = entries.filter((entry) => !sameIds(entry.ids, ids));
      next.push({ ids: [...ids], dueAt });
      await deps.write(next);
      return true;
    } catch {
      return false;
    }
  }

  async function cancelImpl(ids: readonly string[]): Promise<boolean> {
    const entries = await deps.read();
    const entry = entries.find((candidate) => sameIds(candidate.ids, ids));
    if (!entry || entry.cancelled) return false;
    // Keep a cancelled marker so a commit that races with this undo is a
    // no-op instead of deleting the restored record.
    const next = entries.map((candidate) =>
      candidate === entry
        ? { ids: entry.ids, dueAt: now(), cancelled: true }
        : candidate,
    );
    await deps.write(next);
    try {
      await deps.clearDeletions(ids);
    } catch {
      /* Undo already restored the rows; a stale tombstone is retried next sync. */
    }
    return true;
  }

  /**
   * Deletes the records first, then writes tombstones: records and tombstones
   * live in different databases, so a failed record delete must not leave a
   * publishable tombstone for a row the UI is about to restore.
   */
  async function deleteRecords(ids: readonly string[]): Promise<DeleteOutcome> {
    try {
      await deps.removeRecords([...ids]);
    } catch {
      return { removed: false, tombstonesPending: false };
    }
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await deps.recordDeletion(id);
      } catch {
        failed.push(id);
      }
    }
    if (failed.length) {
      deps.onTombstoneFailure?.(failed);
    }
    return { removed: true, tombstonesPending: failed.length > 0 };
  }

  async function commitImpl(ids: readonly string[]): Promise<boolean> {
    const entries = await deps.read();
    const entry = entries.find((candidate) => sameIds(candidate.ids, ids));
    if (!entry) {
      // The intent was lost (overwritten or never persisted). Success is only
      // honest when storage agrees the records are gone; otherwise finish the
      // delete here so the UI's "deleted" matches storage.
      if (!(await deps.anyPresent(ids))) return true;
      const outcome = await deleteRecords(ids);
      return outcome.removed;
    }
    if (entry.cancelled) {
      // The user undid it; a late commit must not delete the records.
      return true;
    }
    const outcome = await deleteRecords(entry.ids);
    if (!outcome.removed) return false;
    if (outcome.tombstonesPending) {
      // Keep the intent as the durable retry marker for the missing tombstones;
      // the records are already gone, so the UI may treat this as success.
      return true;
    }
    try {
      await deps.write(entries.filter((candidate) => candidate !== entry));
    } catch {
      // Records and tombstones are done; leave the intent so the next drain
      // retries the cleanup instead of reporting the deletion as undone.
    }
    return true;
  }

  async function pruneCancelled(entries: DeleteJournalEntry[]) {
    const cutoff = now() - CANCELLED_TTL_MS;
    const kept = entries.filter(
      (entry) => !(entry.cancelled && entry.dueAt <= cutoff),
    );
    if (kept.length !== entries.length) {
      try {
        await deps.write(kept);
      } catch {
        /* Best-effort; the next drain tries again. */
      }
    }
    return kept;
  }

  async function drainExpiredImpl(): Promise<void> {
    const entries = await pruneCancelled(await deps.read());
    const due = entries.filter(
      (entry) => !entry.cancelled && entry.dueAt <= now(),
    );
    for (const entry of due) {
      await commitImpl(entry.ids);
    }
  }

  return {
    queue: (ids, dueAt) => serialize(() => queueImpl(ids, dueAt)),
    cancel: (ids) => serialize(() => cancelImpl(ids)),
    commit: (ids) => serialize(() => commitImpl(ids)),
    pendingIds: () =>
      serialize(async () => {
        const entries = await deps.read();
        return entries
          .filter((entry) => !entry.cancelled)
          .flatMap((entry) => entry.ids);
      }),
    drainExpired: () => serialize(drainExpiredImpl),
  };
}
