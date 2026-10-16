import { defineStore } from "pinia";
import { ref } from "vue";
import { fileToAsset, releaseAsset } from "../core/imageUtils";
import type { AssetItem } from "../types";

/** Maximum number of images that may be loaded into one composition. */
export const MAX_IMAGES = 16;

/** Decode the picked/dropped image files sequentially (avoids decode spikes). */
async function loadFiles(
  files: FileList | File[],
): Promise<{ loaded: AssetItem[]; error: string | null }> {
  const list = Array.from(files).filter((file) =>
    file.type.startsWith("image/"),
  );
  const loaded: AssetItem[] = [];
  let error: string | null = null;
  for (const file of list) {
    try {
      loaded.push(await fileToAsset(file));
    } catch (err) {
      error = err instanceof Error ? err.message : "图片读取失败";
    }
  }
  return { loaded, error };
}

/**
 * Asset list for the editor — a Pinia port of stitch-web's `useAssets` hook.
 * Owns object-URL lifetime: every removed/cleared asset is revoked.
 */
export const useAssetsStore = defineStore("stitch-assets", () => {
  const assets = ref<AssetItem[]>([]);
  const busy = ref(false);
  const error = ref<string | null>(null);

  const inRange = (index: number) => index >= 0 && index < assets.value.length;

  async function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    busy.value = true;
    error.value = null;
    try {
      const result = await loadFiles(files);
      if (result.error) error.value = result.error;
      if (result.loaded.length) {
        assets.value = [...assets.value, ...result.loaded].slice(0, MAX_IMAGES);
      }
    } finally {
      busy.value = false;
    }
  }

  /** Append already-built assets (used by the capture-cache picker). */
  function addAssets(next: AssetItem[]) {
    assets.value = [...assets.value, ...next].slice(0, MAX_IMAGES);
  }

  function remove(id: string) {
    const target = assets.value.find((asset) => asset.id === id);
    if (target) releaseAsset(target);
    assets.value = assets.value.filter((asset) => asset.id !== id);
  }

  function clear() {
    assets.value.forEach(releaseAsset);
    assets.value = [];
  }

  function move(from: number, to: number) {
    if (from === to || !inRange(from) || !inRange(to)) return;
    const next = assets.value.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    assets.value = next;
  }

  function swap(a: number, b: number) {
    if (a === b || !inRange(a) || !inRange(b)) return;
    const next = assets.value.slice();
    [next[a], next[b]] = [next[b], next[a]];
    assets.value = next;
  }

  return {
    assets,
    busy,
    error,
    addFiles,
    addAssets,
    remove,
    clear,
    move,
    swap,
  };
});
