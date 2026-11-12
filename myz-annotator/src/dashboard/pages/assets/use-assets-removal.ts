import type { StagedAssetMeta } from "@myz/core/staged-asset";
import { useRowRemoval } from "@/dashboard/composables/useRowRemoval.js";
import { invoke } from "@/messaging/invoke.js";

/**
 * Deleting captures from the 素材 page (§I6) through the shared I4 session:
 * rows disappear immediately, the bytes are removed when the 6-second window
 * ends, and one undo restores the whole batch.
 *
 * No durable intent here on purpose — unlike a record delete or a reader
 * shortcut, a lost capture-cache delete has no cross-device consequence and
 * the assets themselves are local-only.
 */
export function useAssetsRemoval(reload: () => Promise<void>) {
  return useRowRemoval<StagedAssetMeta>({
    getId: (asset) => asset.id,
    commit: async (_ids, assets) => {
      try {
        for (const asset of assets) {
          const result = await invoke("myz:deleteStagedAsset", {
            id: asset.id,
          });
          if (!result?.ok) return false;
        }
        return true;
      } catch {
        return false;
      }
    },
    reload,
    describe: (assets) => `已删除 ${assets.length} 张素材`,
  });
}
