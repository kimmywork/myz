import type { StagedAssetMeta } from "@myz/core/staged-asset";
import { useRowRemoval } from "@/dashboard/composables/useRowRemoval.js";
import { invoke } from "@/messaging/invoke.js";

/** Failures from the most recent batch, for the page's status line. */
let lastFailureCount = 0;

/** How many captures the last batch failed to delete (0 = all gone). */
export function lastAssetRemovalFailures(): number {
  return lastFailureCount;
}

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
    // Try every capture instead of stopping at the first failure: an early
    // abort leaves rows whose bytes are already gone, and the reload below is
    // what makes the list show exactly what survived.
    commit: async (_ids, assets) => {
      let failed = 0;
      for (const asset of assets) {
        try {
          const result = await invoke("myz:deleteStagedAsset", {
            id: asset.id,
          });
          if (!result?.ok) failed += 1;
        } catch {
          failed += 1;
        }
      }
      lastFailureCount = failed;
      return failed === 0;
    },
    reload,
    describe: (assets) => `已删除 ${assets.length} 张素材`,
    failureMessage: "部分素材未能删除，列表已刷新",
  });
}
