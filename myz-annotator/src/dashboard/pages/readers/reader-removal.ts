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
  title: string;
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

/**
 * `从列表移除` for the reader list (§4.32): the row disappears immediately and
 * the shortcut is dropped when the shared 6-second undo window ends. Undo keeps
 * the shortcut; the local file and its highlights are never touched.
 */
export function useReaderListRemoval(reload: () => Promise<void>) {
  const hiddenKeys = ref<Set<string>>(new Set());
  const undoMessage = ref("");
  const failureMessage = ref("");
  const byKey = new Map<string, RemovableDocument>();
  function setHidden(keys: readonly string[], hidden: boolean) {
    hiddenKeys.value = toggleKeys(hiddenKeys.value, keys, hidden);
  }

  const session = createDeleteSession<RemovableDocument>({
    windowMs: DELETE_UNDO_WINDOW_MS,
    getId: (entry) => entry.key,
    queue: async () => true,
    cancel: async () => true,
    commit: async (ids) => {
      const entries = ids
        .map((id) => byKey.get(id))
        .filter((entry): entry is RemovableDocument => Boolean(entry));
      try {
        for (const { kind, sourceKey, fingerprint } of entries) {
          await readerProgress.remove(kind, sourceKey, fingerprint);
        }
        return true;
      } catch {
        return false;
      }
    },
    restore: (records) => {
      setHidden(
        records.map((record) => record.key),
        false,
      );
      undoMessage.value = "";
      void reload();
    },
    onCommitted: (ids) => {
      setHidden(ids, false);
      undoMessage.value = "";
      void reload();
    },
    onCommitFailed: () => {
      setHidden([...hiddenKeys.value], false);
      undoMessage.value = "";
      failureMessage.value = "移除失败，已恢复";
      void reload();
    },
    onUndone: () => {
      undoMessage.value = "";
    },
  });

  async function remove(entry: RemovableDocument): Promise<boolean> {
    byKey.set(entry.key, entry);
    const scheduled = await session.schedule([entry]);
    if (!scheduled) {
      failureMessage.value = "移除失败，请重试";
      return false;
    }
    setHidden([entry.key], true);
    undoMessage.value = `已从列表移除「${entry.title}」`;
    failureMessage.value = "";
    return true;
  }

  function clearHidden() {
    hiddenKeys.value = new Set();
    undoMessage.value = "";
  }

  return {
    hiddenKeys,
    undoMessage,
    failureMessage,
    remove,
    clearHidden,
    undo: () => session.undo(),
    pause: () => session.pause(),
    resume: () => session.resume(),
    dispose: () => session.dispose(),
  };
}
