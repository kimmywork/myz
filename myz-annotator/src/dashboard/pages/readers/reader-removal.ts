import {
  createRemovalIntents,
  intendsNewerProgress,
} from "./removal-intents.js";
import type { RemovableDocument } from "./removal-intents.js";
import { useRowRemoval } from "@/dashboard/composables/useRowRemoval.js";
import { readerProgress } from "@/reader/progress-store.js";

export type { RemovableDocument } from "./removal-intents.js";

/**
 * `从列表移除` for the reader list (§4.32): the row disappears immediately and
 * the shortcut is dropped when the shared 6-second undo window ends. Undo keeps
 * the shortcut; the local file and its highlights are never touched.
 *
 * The intent is persisted for the same reason the record delete journal
 * persists one: closing the page must not silently drop the removal, so
 * `settleExpired` applies whatever is still queued on the next load.
 */
export function useReaderListRemoval(reload: () => Promise<void>) {
  const byKey = new Map<string, RemovableDocument>();
  const intents = createRemovalIntents();

  function resolve(ids: readonly string[]): RemovableDocument[] {
    return ids
      .map((id) => byKey.get(id))
      .filter((entry): entry is RemovableDocument => Boolean(entry));
  }

  const removal = useRowRemoval<RemovableDocument>({
    getId: (entry) => entry.key,
    queue: async (ids, dueAt) => {
      try {
        await intents.persist("queue", resolve(ids), dueAt);
        return true;
      } catch {
        return false;
      }
    },
    cancel: async (ids) => {
      try {
        await intents.persist("cancel", resolve(ids));
        return true;
      } catch {
        return false;
      }
    },
    // The same "newer save wins" rule as settleExpired: a document reopened
    // during the live undo window must not lose the position saved after the
    // removal was requested.
    commit: async (_ids, entries) => {
      let failed = 0;
      for (const entry of entries) {
        let current: { updatedAt?: string } | undefined;
        try {
          current = await readerProgress.get(entry.kind, entry.sourceKey);
        } catch {
          // Unknown state: keep the shortcut rather than risk a fresh save.
          failed += 1;
          continue;
        }
        if (current && intendsNewerProgress(entry, current.updatedAt)) {
          await intents.persist("cancel", [entry]).catch(() => undefined);
          continue;
        }
        try {
          await readerProgress.remove(
            entry.kind,
            entry.sourceKey,
            entry.fingerprint,
          );
        } catch {
          failed += 1;
          continue;
        }
        await intents.persist("cancel", [entry]).catch(() => undefined);
      }
      return failed === 0;
    },
    reload,
    describe: (entries) => `已从列表移除「${entries[0]?.title ?? ""}」`,
    failureMessage: "移除失败，已恢复",
    // Nothing was hidden yet on this branch, so "已恢复" would be a lie.
    scheduleFailureMessage: "移除失败，请重试",
  });

  async function remove(entry: RemovableDocument): Promise<boolean> {
    byKey.set(entry.key, entry);
    return removal.remove([entry]);
  }

  /**
   * Settles every pending removal before the caller wipes the list.
   *
   * The stored intents are left in place: only the caller knows whether the
   * wipe succeeded, and dropping them first would make an earlier removal
   * unretryable if it did not.
   */
  async function settleAll(): Promise<void> {
    await removal.session.flushAll();
    await intents.settleExpired();
  }

  /** Drops stored intents once the caller's wipe has succeeded. */
  async function clearIntents(): Promise<void> {
    await intents.clear();
  }

  return {
    hiddenKeys: removal.hiddenIds,
    undoMessage: removal.undoMessage,
    failureMessage: removal.failureMessage,
    remove,
    clearHidden: removal.clearHidden,
    settleExpired: () => intents.settleExpired(),
    settleAll,
    clearIntents,
    undo: () => removal.undo(),
    pause: () => removal.pause(),
    resume: () => removal.resume(),
    dispose: () => removal.dispose(),
  };
}
