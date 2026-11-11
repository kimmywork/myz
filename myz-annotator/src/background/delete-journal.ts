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
 * A missing intent is never treated as success on its own — the records are
 * checked in storage first, and finished there when the intent was lost.
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
  /** True when at least one of these records still exists in storage. */
  anyPresent: (ids: readonly string[]) => Promise<boolean>;
  now?: () => number;
}

export interface DeleteJournal {
  /** Persists an intent; `false` when it could not be stored. */
  queue: (ids: readonly string[], dueAt: number) => Promise<boolean>;
  /** Drops the intent; `false` when it was already committed or never existed. */
  cancel: (ids: readonly string[]) => Promise<boolean>;
  /**
   * Commits one intent. When the intent is gone it checks storage: already
   * deleted counts as success, still present is finished here (or fails).
   */
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
 * @param deps Persistence, presence check and deletion ports.
 * @returns The journal API used by message handlers and the drain alarm.
 */
export function createDeleteJournal(deps: DeleteJournalDeps): DeleteJournal {
  const now = deps.now ?? (() => Date.now());

  /**
   * One serial chain for every read-modify-write. A failing task must not
   * break the chain for the next one.
   */
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
    const next = entries.filter((entry) => !sameIds(entry.ids, ids));
    if (next.length === entries.length) return false;
    await deps.write(next);
    return true;
  }

  async function deleteRecords(ids: readonly string[]): Promise<boolean> {
    try {
      for (const id of ids) {
        await deps.recordDeletion(id);
      }
      await deps.removeRecords([...ids]);
      return true;
    } catch {
      return false;
    }
  }

  async function commitImpl(ids: readonly string[]): Promise<boolean> {
    const entries = await deps.read();
    const entry = entries.find((candidate) => sameIds(candidate.ids, ids));
    if (!entry) {
      // The intent was lost (overwritten or never persisted). Success is only
      // honest when storage agrees the records are gone; otherwise finish the
      // delete here so the UI's "deleted" matches storage.
      const stillThere = await deps.anyPresent(ids);
      if (!stillThere) return true;
      return deleteRecords(ids);
    }
    const removed = await deleteRecords(entry.ids);
    if (!removed) {
      // Keep the intent so the next drain retries; the UI restores the rows.
      return false;
    }
    await deps.write(entries.filter((candidate) => candidate !== entry));
    return true;
  }

  async function drainExpiredImpl(): Promise<void> {
    const entries = await deps.read();
    const due = entries.filter((entry) => entry.dueAt <= now());
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
        return entries.flatMap((entry) => entry.ids);
      }),
    drainExpired: () => serialize(drainExpiredImpl),
  };
}
