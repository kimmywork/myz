import { defineStore } from "pinia";
import { ref } from "vue";
import { assetFromDataUrl } from "../core/imageUtils";
import type { StagedAssetMeta } from "../staged-asset";
import type { AssetItem } from "../types";
import { invoke } from "@/messaging/invoke";

/**
 * The capture cache as seen by the editor. Only metadata is listed up front;
 * the full payload is fetched per asset when it is pulled into a composition.
 */
export const useStagingStore = defineStore("stitch-staging", () => {
  const items = ref<StagedAssetMeta[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function refresh() {
    loading.value = true;
    error.value = null;
    try {
      const list = await invoke("myz:listStagedAssets");
      items.value = Array.isArray(list) ? list : [];
    } catch (err) {
      error.value = err instanceof Error ? err.message : "读取缓存区失败";
      items.value = [];
    } finally {
      loading.value = false;
    }
  }

  /** Resolve the selected cache entries into editable assets. */
  async function importAssets(ids: string[]): Promise<AssetItem[]> {
    const loaded: AssetItem[] = [];
    for (const id of ids) {
      try {
        const full = await invoke("myz:getStagedAsset", { id });
        if (full?.dataUrl) {
          loaded.push(
            await assetFromDataUrl(full.dataUrl, full.name, "staged"),
          );
        }
      } catch (err) {
        console.warn("MyZ: failed to load staged asset", id, err);
      }
    }
    return loaded;
  }

  async function removeStaged(id: string) {
    await invoke("myz:deleteStagedAsset", { id });
    items.value = items.value.filter((item) => item.id !== id);
  }

  async function clearStaged() {
    await invoke("myz:clearStagedAssets");
    items.value = [];
  }

  return {
    items,
    loading,
    error,
    refresh,
    importAssets,
    removeStaged,
    clearStaged,
  };
});
