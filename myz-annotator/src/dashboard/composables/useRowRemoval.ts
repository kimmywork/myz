import {
  DELETE_UNDO_WINDOW_MS,
  createDeleteSession,
} from "@myz/core/delete-session";
import { ref } from "vue";
import type { Ref } from "vue";

export interface RowRemovalOptions<T> {
  getId: (item: T) => string;
  /** Deletes the items for real; `false` restores the rows. */
  commit: (ids: readonly string[], items: readonly T[]) => Promise<boolean>;
  reload: () => Promise<void>;
  /** Undo-bar copy for a batch. */
  describe: (items: readonly T[]) => string;
  failureMessage?: string;
  /** Durable-intent hooks; omit when the surface has none. */
  queue?: (ids: readonly string[], dueAt: number) => Promise<boolean>;
  cancel?: (ids: readonly string[]) => Promise<boolean>;
}

export interface RowRemoval<T> {
  hiddenIds: Ref<Set<string>>;
  undoMessage: Ref<string>;
  failureMessage: Ref<string>;
  remove: (items: readonly T[]) => Promise<boolean>;
  clearHidden: () => void;
  undo: () => Promise<boolean>;
  pause: () => void;
  resume: () => void;
  dispose: () => void;
  /** The underlying session, for surfaces that need to settle its commits. */
  session: ReturnType<typeof createDeleteSession<T>>;
}

/**
 * Shared "rows disappear now, really go when the undo window ends" wiring for
 * a list surface (§4.30). Two pages use it: the reader list (with a durable
 * intent) and the 素材 page (local-only captures, no intent).
 *
 * Each removal keeps its own group and undo bar (`flushPrevious: false`), and
 * every callback only touches its own ids, so a second removal is never
 * clobbered by an older group finishing.
 */
export function useRowRemoval<T>(options: RowRemovalOptions<T>): RowRemoval<T> {
  const hiddenIds = ref<Set<string>>(new Set());
  const undoMessage = ref("");
  const failureMessage = ref("");
  const openGroups = new Set<string>();
  /** Items captured when their removal started, so `commit(ids)` can resolve. */
  const byId = new Map<string, T>();

  function itemsById(ids: readonly string[]): T[] {
    return ids
      .map((id) => byId.get(id))
      .filter((item): item is T => item !== undefined);
  }

  function setHidden(ids: readonly string[], hidden: boolean) {
    const next = new Set(hiddenIds.value);
    ids.forEach((id) => {
      if (hidden) next.add(id);
      else next.delete(id);
    });
    hiddenIds.value = next;
  }

  function track(ids: readonly string[], open: boolean) {
    ids.forEach((id) => {
      if (open) openGroups.add(id);
      else openGroups.delete(id);
    });
  }

  function clearUndoIfIdle() {
    if (!openGroups.size) undoMessage.value = "";
  }

  const session = createDeleteSession<T>({
    windowMs: DELETE_UNDO_WINDOW_MS,
    getId: options.getId,
    queue: options.queue ?? (async () => true),
    cancel: options.cancel ?? (async () => true),
    commit: (ids) => options.commit(ids, itemsById(ids)),
    restore: (items) => {
      const ids = items.map(options.getId);
      ids.forEach((id) => byId.delete(id));
      track(ids, false);
      setHidden(ids, false);
      clearUndoIfIdle();
      void options.reload();
    },
    onCommitted: (ids) => {
      ids.forEach((id) => byId.delete(id));
      track(ids, false);
      setHidden(ids, false);
      clearUndoIfIdle();
      void options.reload();
    },
    onCommitFailed: (items) => {
      const ids = items.map(options.getId);
      ids.forEach((id) => byId.delete(id));
      track(ids, false);
      setHidden(ids, false);
      failureMessage.value = options.failureMessage ?? "删除失败，已恢复";
      clearUndoIfIdle();
      void options.reload();
    },
    onUndone: (items) => {
      track(items.map(options.getId), false);
      clearUndoIfIdle();
    },
  });

  async function remove(items: readonly T[]): Promise<boolean> {
    if (!items.length) return false;
    const ids = items.map(options.getId);
    const scheduled = await session.schedule(items, { flushPrevious: false });
    if (!scheduled) {
      failureMessage.value = options.failureMessage ?? "删除失败，请重试";
      return false;
    }
    items.forEach((item) => byId.set(options.getId(item), item));
    track(ids, true);
    setHidden(ids, true);
    undoMessage.value = options.describe(items);
    failureMessage.value = "";
    return true;
  }

  function clearHidden() {
    hiddenIds.value = new Set();
    openGroups.clear();
    undoMessage.value = "";
  }

  return {
    hiddenIds,
    undoMessage,
    failureMessage,
    remove,
    clearHidden,
    undo: () => session.undo(),
    pause: () => session.pause(),
    resume: () => session.resume(),
    dispose: () => session.dispose(),
    session,
  };
}
