import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { fileToAsset, releaseAsset } from "../core/imageUtils";
import type { AssetItem } from "../types";

/** Maximum number of images that may be loaded into one composition. */
export const MAX_IMAGES = 16;

/**
 * Asset list for the editor — a Pinia port of stitch-web's `useAssets` hook.
 * Owns object-URL lifetime: every removed/cleared asset is revoked.
 */
export const useAssetsStore = defineStore("stitch-assets", () => {
  const assets = ref<AssetItem[]>([]);
  const busy = ref(false);
  const error = ref<string | null>(null);

  const count = computed(() => assets.value.length);
  const isEmpty = computed(() => assets.value.length === 0);

  async function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const list = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (list.length === 0) return;
    busy.value = true;
    error.value = null;
    try {
      const loaded: AssetItem[] = [];
      for (const file of list) {
        try {
          loaded.push(await fileToAsset(file));
        } catch (err) {
          error.value = err instanceof Error ? err.message : "图片读取失败";
        }
      }
      assets.value = [...assets.value, ...loaded].slice(0, MAX_IMAGES);
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
    if (
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= assets.value.length ||
      to >= assets.value.length
    ) {
      return;
    }
    const next = assets.value.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    assets.value = next;
  }

  function swap(a: number, b: number) {
    if (
      a === b ||
      a < 0 ||
      b < 0 ||
      a >= assets.value.length ||
      b >= assets.value.length
    ) {
      return;
    }
    const next = assets.value.slice();
    [next[a], next[b]] = [next[b], next[a]];
    assets.value = next;
  }

  function replaceAll(next: AssetItem[]) {
    assets.value.forEach(releaseAsset);
    assets.value = next.slice(0, MAX_IMAGES);
  }

  return {
    assets,
    busy,
    error,
    count,
    isEmpty,
    addFiles,
    addAssets,
    remove,
    clear,
    move,
    swap,
    replaceAll,
  };
});
