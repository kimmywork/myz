import {
  DELETE_UNDO_WINDOW_MS,
  createDeleteSession,
} from "@myz/core/delete-session";
import type { StagedAssetMeta } from "@myz/core/staged-asset";
import { ref } from "vue";
import { invoke } from "@/messaging/invoke.js";

/**
 * Deleting captures from the 素材 page (§I6) through the shared I4 session:
 * rows disappear immediately, the bytes are removed when the 6-second window
 * ends, and one undo restores the whole batch.
 *
 * Nothing is persisted here on purpose — unlike a record delete or a reader
 * shortcut, a lost capture-cache delete has no cross-device consequence, and
 * the assets themselves are local-only. Leaving the page commits the batch.
 */
export function useAssetsRemoval(reload: () => Promise<void>) {
  const hiddenIds = ref<Set<string>>(new Set());
  const undoMessage = ref("");
  const failureMessage = ref("");
  const openGroups = new Set<string>();

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

  const session = createDeleteSession<StagedAssetMeta>({
    windowMs: DELETE_UNDO_WINDOW_MS,
    getId: (asset) => asset.id,
    // No durable intent: see the module note.
    queue: async () => true,
    cancel: async () => true,
    commit: async (ids) => {
      try {
        for (const id of ids) {
          const result = await invoke("myz:deleteStagedAsset", { id });
          if (!result?.ok) return false;
        }
        return true;
      } catch {
        return false;
      }
    },
    restore: (assets) => {
      const ids = assets.map((asset) => asset.id);
      track(ids, false);
      setHidden(ids, false);
      clearUndoIfIdle();
      void reload();
    },
    onCommitted: (ids) => {
      track(ids, false);
      setHidden(ids, false);
      clearUndoIfIdle();
      void reload();
    },
    onCommitFailed: (assets) => {
      const ids = assets.map((asset) => asset.id);
      track(ids, false);
      setHidden(ids, false);
      failureMessage.value = "删除失败，已恢复";
      clearUndoIfIdle();
      void reload();
    },
    onUndone: (assets) => {
      track(
        assets.map((asset) => asset.id),
        false,
      );
      clearUndoIfIdle();
    },
  });

  /**
   * Hides the batch and opens its undo window.
   *
   * @returns `false` when the group could not be scheduled.
   */
  async function remove(assets: readonly StagedAssetMeta[]): Promise<boolean> {
    if (!assets.length) return false;
    const ids = assets.map((asset) => asset.id);
    const scheduled = await session.schedule(assets, { flushPrevious: false });
    if (!scheduled) {
      failureMessage.value = "删除失败，请重试";
      return false;
    }
    track(ids, true);
    setHidden(ids, true);
    undoMessage.value = `已删除 ${assets.length} 张素材`;
    failureMessage.value = "";
    return true;
  }

  return {
    hiddenIds,
    undoMessage,
    failureMessage,
    remove,
    undo: () => session.undo(),
    pause: () => session.pause(),
    resume: () => session.resume(),
    dispose: () => session.dispose(),
  };
}
