import { readerProgress } from "@/reader/progress-store.js";

/** The part of a reader-list entry the removal session needs. */
export interface RemovableDocument {
  key: string;
  kind: "pdf" | "epub";
  sourceKey: string;
  /** The stored file handle is keyed by fingerprint, not sourceKey. */
  fingerprint?: string;
  /** Progress stamp when the removal was requested, to spot a newer save. */
  updatedAt?: string;
  title: string;
}

/** Where pending removals wait so closing the page cannot lose them. */
const INTENT_KEY = "myz_reader_removal_intents";

interface RemovalIntent extends RemovableDocument {
  dueAt: number;
}

/** True when the stored progress was saved after the removal was requested. */
export function intendsNewerProgress(
  intent: Pick<RemovableDocument, "updatedAt">,
  progressUpdatedAt: string | undefined,
): boolean {
  if (!intent.updatedAt || !progressUpdatedAt) return false;
  return progressUpdatedAt > intent.updatedAt;
}

/**
 * Reads the stored intents.
 *
 * @param strict When true a failed read throws instead of reading as empty: a
 *   writer must not overwrite intents it could not see, or an earlier pending
 *   removal loses its durable record.
 */
async function readIntents(strict = false): Promise<RemovalIntent[]> {
  try {
    const stored = await chrome.storage.local.get(INTENT_KEY);
    const list = stored?.[INTENT_KEY];
    return Array.isArray(list) ? (list as RemovalIntent[]) : [];
  } catch (error) {
    if (strict) throw error;
    return [];
  }
}

async function writeIntents(intents: readonly RemovalIntent[]): Promise<void> {
  if (!intents.length) {
    await chrome.storage.local.remove(INTENT_KEY);
    return;
  }
  await chrome.storage.local.set({ [INTENT_KEY]: intents });
}

/**
 * Durable queue for reader-list removals (see `useReaderListRemoval`).
 *
 * Writes are serialised on one chain: the session may queue a paused group and
 * cancel it moments later, and an unserialised read-modify-write could revive
 * the intent so a later settle deleted a document the user had saved again.
 */
export function createRemovalIntents() {
  let chain: Promise<void> = Promise.resolve();

  function persist(
    action: "queue" | "cancel",
    records: readonly RemovableDocument[],
    dueAt = 0,
  ): Promise<void> {
    const run = chain.then(async () => {
      // Strict: a failed read must abort the write, not replace every intent.
      const current = await readIntents(true);
      const keys = new Set(records.map((record) => record.key));
      const rest = current.filter((intent) => !keys.has(intent.key));
      if (action === "queue") {
        const appended = records
          .filter((record) => record.kind && record.sourceKey)
          .map((record) => ({ ...record, dueAt }));
        await writeIntents([...rest, ...appended]);
      } else {
        await writeIntents(rest);
      }
    });
    // A failed write must not break the chain for later operations.
    chain = run.catch(() => undefined);
    return run;
  }

  /**
   * Applies removals whose undo window passed while the page was closed.
   *
   * @returns How many shortcuts were actually dropped.
   */
  async function settleExpired(): Promise<number> {
    const intents = await readIntents().catch((): RemovalIntent[] => []);
    const due = intents.filter((intent) => intent.dueAt <= Date.now());
    let applied = 0;
    for (const intent of due) {
      // The document may have been reopened and saved again after the intent
      // was written. Deleting then would erase the new position, so compare
      // the progress stamp and drop the stale intent instead.
      let current: { updatedAt?: string } | undefined;
      try {
        current = await readerProgress.get(intent.kind, intent.sourceKey);
      } catch {
        // Cannot tell whether a newer position was saved: keep the intent and
        // retry on the next load instead of risking a fresh save.
        continue;
      }
      if (current && intendsNewerProgress(intent, current.updatedAt)) {
        await persist("cancel", [intent]).catch(() => undefined);
        continue;
      }
      try {
        await readerProgress.remove(
          intent.kind,
          intent.sourceKey,
          intent.fingerprint,
        );
        applied += 1;
      } catch {
        // Keep the intent so the next load retries it.
        continue;
      }
      await persist("cancel", [intent]).catch(() => undefined);
    }
    return applied;
  }

  /** Drops every intent after the caller emptied the list. */
  async function clear(): Promise<void> {
    await writeIntents([]).catch(() => undefined);
  }

  return { persist, settleExpired, clear };
}
