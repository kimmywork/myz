import type { StagedAssetMeta } from "@myz/core/staged-asset";
import { computed, ref } from "vue";
import type { ComputedRef, Ref } from "vue";
import { invoke } from "@/messaging/invoke.js";

/** Sort order for the asset grid. */
export type AssetSort = "newest" | "oldest" | "largest";

export interface StagedAssetsState {
  assets: Ref<StagedAssetMeta[]>;
  loading: Ref<boolean>;
  error: Ref<string>;
  /** "N 张 · 共 x MB" for the page header. */
  usageText: ComputedRef<string>;
  reload: () => Promise<void>;
  /** Drops ids locally (used after a committed delete, before the reload). */
  forget: (ids: readonly string[]) => void;
}

/**
 * Capture-cache listing for the assets page (§I6). The background owns the
 * bytes; this only holds the metadata list (no `dataUrl`) so the page stays
 * cheap even with a few hundred captures.
 */
export function useStagedAssets(): StagedAssetsState {
  const assets = ref<StagedAssetMeta[]>([]);
  const loading = ref(true);
  const error = ref("");

  const usageText = computed(() => {
    const bytes = assets.value.reduce(
      (sum, asset) => sum + (asset.size || 0),
      0,
    );
    return `${assets.value.length} 张 · 共 ${formatBytes(bytes)}`;
  });

  async function reload() {
    loading.value = true;
    error.value = "";
    try {
      const list = await invoke("myz:listStagedAssets");
      assets.value = Array.isArray(list) ? list : [];
    } catch (loadError) {
      console.warn("Failed to load staged assets", loadError);
      error.value = "读取缓存区失败，请稍后重试";
      assets.value = [];
    } finally {
      loading.value = false;
    }
  }

  function forget(ids: readonly string[]) {
    const removed = new Set(ids);
    assets.value = assets.value.filter((asset) => !removed.has(asset.id));
  }

  return { assets, loading, error, usageText, reload, forget };
}

/** Byte size with one decimal at most, matching the stitch picker's wording. */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rendered = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${rendered} ${units[unit]}`;
}

/** Human label for a capture kind (matches the stitch picker). */
export const ASSET_KIND_LABEL: Record<string, string> = {
  image: "网页图片",
  "video-frame": "视频帧",
  screenshot: "截图",
};

export function assetKindLabel(kind: string | undefined): string {
  return ASSET_KIND_LABEL[kind ?? ""] ?? "图片";
}

/** Source host for the card, falling back to the raw url. */
export function assetSourceLabel(asset: StagedAssetMeta): string {
  if (!asset.sourceUrl) return "本地文件";
  try {
    return new URL(asset.sourceUrl).hostname || asset.sourceUrl;
  } catch {
    return asset.sourceUrl;
  }
}
