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
  /** Shown when the commit failed and the rows were put back. */
  failureMessage?: string;
  /**
   * Shown when the intent could not be queued. Nothing was hidden in that
   * branch, so it must not claim the rows were restored.
   */
  scheduleFailureMessage?: string;
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

  /** Copy per group, so the bar always names the group undo would target. */
  const messageByGroup = new Map<string, string>();

  /**
   * Points the bar at the newest group still open. After an undo or a commit
   * the previous message names a group that no longer exists, and the next
   * undo would hit a different one.
   */
  function syncUndoMessage() {
    let latest = "";
    openGroups.forEach((id) => {
      const message = messageByGroup.get(id);
      if (message) latest = message;
    });
    undoMessage.value = latest;
  }

  function forgetGroup(ids: readonly string[]) {
    ids.forEach((id) => {
      messageByGroup.delete(id);
      byId.delete(id);
    });
    syncUndoMessage();
  }

  const session = createDeleteSession<T>({
    windowMs: DELETE_UNDO_WINDOW_MS,
    getId: options.getId,
    queue: options.queue ?? (async () => true),
    cancel: options.cancel ?? (async () => true),
    commit: (ids) => options.commit(ids, itemsById(ids)),
    restore: (items) => {
      const ids = items.map(options.getId);
      track(ids, false);
      setHidden(ids, false);
      forgetGroup(ids);
      void options.reload();
    },
    onCommitted: (ids) => {
      track(ids, false);
      setHidden(ids, false);
      forgetGroup(ids);
      void options.reload();
    },
    onCommitFailed: (items) => {
      const ids = items.map(options.getId);
      track(ids, false);
      setHidden(ids, false);
      failureMessage.value = options.failureMessage ?? "删除失败，已恢复";
      forgetGroup(ids);
      void options.reload();
    },
    onUndone: (items) => {
      const ids = items.map(options.getId);
      track(ids, false);
      forgetGroup(ids);
    },
  });

  async function remove(items: readonly T[]): Promise<boolean> {
    if (!items.length) return false;
    const ids = items.map(options.getId);
    const scheduled = await session.schedule(items, { flushPrevious: false });
    if (!scheduled) {
      failureMessage.value =
        options.scheduleFailureMessage ?? "删除失败，请重试";
      return false;
    }
    items.forEach((item) => byId.set(options.getId(item), item));
    track(ids, true);
    setHidden(ids, true);
    const message = options.describe(items);
    ids.forEach((id) => messageByGroup.set(id, message));
    undoMessage.value = message;
    failureMessage.value = "";
    return true;
  }

  function clearHidden() {
    hiddenIds.value = new Set();
    openGroups.clear();
    messageByGroup.clear();
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
