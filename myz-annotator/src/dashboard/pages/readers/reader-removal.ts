import {
  DELETE_UNDO_WINDOW_MS,
  createDeleteSession,
} from "@myz/core/delete-session";
import { ref } from "vue";
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
function intendsNewerProgress(
  intent: RemovalIntent,
  progressUpdatedAt: string | undefined,
): boolean {
  if (!intent.updatedAt || !progressUpdatedAt) return false;
  return progressUpdatedAt > intent.updatedAt;
}

function toggleKeys(
  current: ReadonlySet<string>,
  keys: readonly string[],
  hidden: boolean,
): Set<string> {
  const next = new Set(current);
  keys.forEach((key) => {
    if (hidden) next.add(key);
    else next.delete(key);
  });
  return next;
}

async function readIntents(): Promise<RemovalIntent[]> {
  try {
    const stored = await chrome.storage.local.get(INTENT_KEY);
    const list = stored?.[INTENT_KEY];
    return Array.isArray(list) ? (list as RemovalIntent[]) : [];
  } catch {
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
 * `从列表移除` for the reader list (§4.32): the row disappears immediately and
 * the shortcut is dropped when the shared 6-second undo window ends. Undo keeps
 * the shortcut; the local file and its highlights are never touched.
 *
 * The intent is persisted (unlike a pure in-page timer) for the same reason the
 * record delete journal persists one: closing the page must not silently drop
 * the removal — `onSettled` applies whatever is still queued on the next load.
 */
export function useReaderListRemoval(reload: () => Promise<void>) {
  const hiddenKeys = ref<Set<string>>(new Set());
  const undoMessage = ref("");
  const failureMessage = ref("");
  const byKey = new Map<string, RemovableDocument>();
  /** Keys of groups still waiting out their undo window. */
  const openGroups = new Set<string>();

  function setHidden(keys: readonly string[], hidden: boolean) {
    hiddenKeys.value = toggleKeys(hiddenKeys.value, keys, hidden);
  }

  /** Only clear the undo bar when no other group still owns it. */
  function clearUndoIfIdle() {
    if (!openGroups.size) undoMessage.value = "";
  }

  function track(ids: readonly string[], open: boolean) {
    ids.forEach((id) => {
      if (open) openGroups.add(id);
      else openGroups.delete(id);
    });
  }

  /**
   * Read-modify-write of the intent list, serialised on one chain. Without it
   * a paused group's `queue` write can land after an `undo`'s `cancel` and
   * resurrect the intent, so a later `settleExpired` would delete a document
   * the user had just saved.
   */
  let intentChain: Promise<void> = Promise.resolve();

  function persist(
    action: "queue" | "cancel",
    records: readonly RemovableDocument[],
    dueAt = 0,
  ): Promise<void> {
    const run = intentChain.then(async () => {
      const current = await readIntents();
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
    intentChain = run.catch(() => undefined);
    return run;
  }

  const session = createDeleteSession<RemovableDocument>({
    windowMs: DELETE_UNDO_WINDOW_MS,
    getId: (entry) => entry.key,
    queue: async (ids, dueAt) => {
      const records = ids
        .map((id) => byKey.get(id))
        .filter((entry): entry is RemovableDocument => Boolean(entry));
      try {
        await persist("queue", records, dueAt);
        return true;
      } catch {
        return false;
      }
    },
    cancel: async (ids) => {
      const records = ids
        .map((id) => byKey.get(id))
        .filter((entry): entry is RemovableDocument => Boolean(entry));
      try {
        await persist("cancel", records);
        return true;
      } catch {
        return false;
      }
    },
    commit: async (ids) => {
      const records = ids
        .map((id) => byKey.get(id))
        .filter((entry): entry is RemovableDocument => Boolean(entry));
      try {
        for (const { kind, sourceKey, fingerprint } of records) {
          await readerProgress.remove(kind, sourceKey, fingerprint);
        }
        // The shortcut is gone: drop the durable intent too.
        await persist("cancel", records).catch(() => undefined);
        return true;
      } catch {
        return false;
      }
    },
    restore: (records) => {
      const ids = records.map((record) => record.key);
      track(ids, false);
      setHidden(ids, false);
      clearUndoIfIdle();
      void reload();
    },
    onCommitted: (ids) => {
      track(ids, false);
      // Only this group's rows come back; a newer removal keeps its own state.
      setHidden(ids, false);
      clearUndoIfIdle();
      void reload();
    },
    onCommitFailed: (records) => {
      const ids = records.map((record) => record.key);
      track(ids, false);
      // Unhide only the failed group, never a newer pending one.
      setHidden(ids, false);
      failureMessage.value = "移除失败，已恢复";
      clearUndoIfIdle();
      void reload();
    },
    onUndone: (records) => {
      track(
        records.map((record) => record.key),
        false,
      );
      clearUndoIfIdle();
    },
  });

  async function remove(entry: RemovableDocument): Promise<boolean> {
    byKey.set(entry.key, entry);
    // Each removal keeps its own group and undo bar: a second removal must not
    // flush (nor wait for) the first one's commit.
    const scheduled = await session.schedule([entry], { flushPrevious: false });
    if (!scheduled) {
      failureMessage.value = "移除失败，请重试";
      return false;
    }
    track([entry.key], true);
    setHidden([entry.key], true);
    undoMessage.value = `已从列表移除「${entry.title}」`;
    failureMessage.value = "";
    return true;
  }

  /**
   * Applies removals whose undo window already passed while the page was
   * closed, so a dropped page does not resurrect a removed shortcut.
   */
  async function settleExpired(): Promise<number> {
    const intents = await readIntents().catch((): RemovalIntent[] => []);
    if (!intents.length) return 0;
    const now = Date.now();
    const due = intents.filter((intent) => intent.dueAt <= now);
    if (!due.length) return 0;
    let applied = 0;
    for (const intent of due) {
      // The document may have been reopened and saved again after the intent
      // was written. Deleting then would erase the new position, so compare
      // the progress stamp and drop the stale intent instead.
      const current = await readerProgress
        .get(intent.kind, intent.sourceKey)
        .catch(() => undefined);
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

  /**
   * Settles every pending removal (waiting and in flight) before the caller
   * wipes the list, so no stale timer can delete a freshly saved row.
   */
  async function settleAll(): Promise<void> {
    await session.flushAll();
    const intents = await readIntents().catch((): RemovalIntent[] => []);
    for (const intent of intents) {
      await readerProgress
        .remove(intent.kind, intent.sourceKey, intent.fingerprint)
        .catch(() => undefined);
    }
    await writeIntents([]).catch(() => undefined);
  }

  function clearHidden() {
    hiddenKeys.value = new Set();
    openGroups.clear();
    undoMessage.value = "";
  }

  return {
    hiddenKeys,
    undoMessage,
    failureMessage,
    remove,
    clearHidden,
    settleExpired,
    settleAll,
    undo: () => session.undo(),
    pause: () => session.pause(),
    resume: () => session.resume(),
    dispose: () => session.dispose(),
  };
}
