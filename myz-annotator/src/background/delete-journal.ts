/**
 * Durable intent journal for deferred deletes (§4.30).
 *
 * The undo window keeps storage untouched, so a page that dies mid-window must
 * not lose the delete. The UI persists an intent here *before* it removes the
 * rows; the background commits it when the window ends, and drains overdue
 * intents on startup / alarm so closing the page still deletes the records.
 *
 * Storage and record deletion are injected so this stays testable without
 * chrome or IndexedDB.
 */
export interface DeleteJournalEntry {
  ids: string[];
  dueAt: number;
}

export interface DeleteJournalDeps {
  read: () => Promise<DeleteJournalEntry[]>;
  write: (entries: DeleteJournalEntry[]) => Promise<void>;
  /** Removes the records in one transaction (batch atomicity). */
  removeRecords: (ids: string[]) => Promise<void>;
  /** Records the sync deletion tombstone. */
  recordDeletion: (id: string) => Promise<void>;
  now?: () => number;
}

export interface DeleteJournal {
  /** Persists an intent; `false` when it could not be stored. */
  queue: (ids: readonly string[], dueAt: number) => Promise<boolean>;
  /** Drops the intent for this exact id set (undo / failed commit). */
  cancel: (ids: readonly string[]) => Promise<void>;
  /** Commits one intent. Idempotent: an unknown id set counts as committed. */
  commit: (ids: readonly string[]) => Promise<boolean>;
  /** Every pending id, expired or not. */
  pendingIds: () => Promise<string[]>;
  /** Commits every intent whose deadline has passed. */
  drainExpired: () => Promise<void>;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((id, index) => id === sortedRight[index]);
}

/**
 * Creates the journal over injected storage and record ports.
 *
 * @param deps Persistence and deletion ports.
 * @returns The journal API used by message handlers and the drain alarm.
 */
export function createDeleteJournal(deps: DeleteJournalDeps): DeleteJournal {
  const now = deps.now ?? (() => Date.now());

  async function queue(
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

  async function cancel(ids: readonly string[]): Promise<void> {
    const entries = await deps.read();
    const next = entries.filter((entry) => !sameIds(entry.ids, ids));
    if (next.length !== entries.length) {
      await deps.write(next);
    }
  }

  async function commit(ids: readonly string[]): Promise<boolean> {
    const entries = await deps.read();
    const entry = entries.find((candidate) => sameIds(candidate.ids, ids));
    // Already committed (a drain won the race) — report success.
    if (!entry) return true;
    try {
      for (const id of entry.ids) {
        await deps.recordDeletion(id);
      }
      await deps.removeRecords(entry.ids);
    } catch {
      // Keep the intent so the next drain retries; the UI restores the rows.
      return false;
    }
    await deps.write(entries.filter((candidate) => candidate !== entry));
    return true;
  }

  async function pendingIds(): Promise<string[]> {
    const entries = await deps.read();
    return entries.flatMap((entry) => entry.ids);
  }

  async function drainExpired(): Promise<void> {
    const entries = await deps.read();
    const due = entries.filter((entry) => entry.dueAt <= now());
    for (const entry of due) {
      await commit(entry.ids);
    }
  }

  return { queue, cancel, commit, pendingIds, drainExpired };
}
