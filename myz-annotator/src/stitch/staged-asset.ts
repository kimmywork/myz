/**
 * Staged asset model — the "capture cache" surfaced by the stitch editor.
 *
 * Captures (page images, video frames, selection/article screenshots) are kept
 * as base64 `data:` URLs so they can travel through extension messaging
 * (JSON-serialized) and be persisted in the background's IndexedDB. A small
 * thumbnail accompanies each asset so listing the cache stays cheap; the full
 * payload is fetched on demand. These assets are local-only and never synced.
 */

import type {
  StagedAsset,
  StagedAssetContext,
  StagedAssetKind,
  StagedAssetMeta,
} from "@myz/core/staged-asset";

export type {
  NewStagedAsset,
  StagedAsset,
  StagedAssetContext,
  StagedAssetKind,
  StagedAssetMeta,
} from "@myz/core/staged-asset";

/** Longest-edge cap for the generated thumbnail, in CSS pixels. */
export const STAGED_ASSET_THUMB_EDGE = 320;

/**
 * Reject payloads above this decoded size. Keeps a runaway capture from
 * wedging IndexedDB or the messaging channel; well above a 16k-px screenshot.
 */
export const STAGED_ASSET_MAX_BYTES = 64 * 1024 * 1024;

export const STAGED_ASSET_KINDS: readonly StagedAssetKind[] = [
  "image",
  "video-frame",
  "screenshot",
];

export function isStagedAssetKind(value: unknown): value is StagedAssetKind {
  return (
    typeof value === "string" &&
    (STAGED_ASSET_KINDS as readonly string[]).includes(value)
  );
}

/**
 * What a record card needs to draw an attachment (§I7): a thumbnail, the kind
 * for the badge, and the video position for the `mm:ss` label.
 */
export interface StagedAssetSummary {
  id: string;
  thumb: string;
  sourceKind: StagedAssetKind;
  /** Video position in seconds, when the capture was a video frame. */
  timeSeconds?: number;
  /** Host page title, when the capture recorded one. */
  pageTitle?: string;
}

export function toStagedAssetSummary(asset: StagedAsset): StagedAssetSummary {
  return {
    id: asset.id,
    thumb: asset.thumb,
    sourceKind: asset.sourceKind,
    timeSeconds: asset.context?.timeSeconds,
    pageTitle: asset.context?.pageTitle,
  };
}

/** Strips the list payload down to its metadata (no `dataUrl`). */
export function toStagedAssetMeta(asset: StagedAsset): StagedAssetMeta {
  const { dataUrl: _dataUrl, ...meta } = asset;
  return meta;
}

/**
 * Defensive normalization for values crossing the messaging boundary. Returns
 * `null` when the record is unusable (missing id / payload / dimensions) so the
 * caller can drop it instead of surfacing a broken thumbnail.
 */
export function normalizeStagedAsset(raw: unknown): StagedAsset | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<StagedAsset>;
  if (typeof candidate.id !== "string" || !candidate.id) return null;
  if (typeof candidate.dataUrl !== "string" || !candidate.dataUrl) return null;
  const sourceKind: StagedAssetKind = isStagedAssetKind(candidate.sourceKind)
    ? candidate.sourceKind
    : "image";
  return {
    id: candidate.id,
    name:
      typeof candidate.name === "string" && candidate.name
        ? candidate.name
        : "未命名图片",
    mime:
      typeof candidate.mime === "string" && candidate.mime
        ? candidate.mime
        : "image/png",
    width: toPositiveInt(candidate.width),
    height: toPositiveInt(candidate.height),
    dataUrl: candidate.dataUrl,
    thumb:
      typeof candidate.thumb === "string" && candidate.thumb
        ? candidate.thumb
        : candidate.dataUrl,
    sourceUrl:
      typeof candidate.sourceUrl === "string" && candidate.sourceUrl
        ? candidate.sourceUrl
        : undefined,
    sourceKind,
    createdAt:
      typeof candidate.createdAt === "string" && candidate.createdAt
        ? candidate.createdAt
        : new Date().toISOString(),
    size: toPositiveInt(candidate.size),
    context: normalizeContext(candidate.context),
  };
}

/**
 * Keeps only the context fields that carry real information, so a capture that
 * sent nothing extra stores nothing extra (its record is byte-identical to
 * the pre-I7 shape).
 */
function normalizeContext(raw: unknown): StagedAssetContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as StagedAssetContext;
  const context: StagedAssetContext = {};
  if (typeof value.pageUrl === "string" && value.pageUrl) {
    context.pageUrl = value.pageUrl;
  }
  if (typeof value.pageTitle === "string" && value.pageTitle) {
    context.pageTitle = value.pageTitle;
  }
  const text = typeof value.text === "string" ? value.text.trim() : "";
  if (text) context.text = text;
  if (
    typeof value.timeSeconds === "number" &&
    Number.isFinite(value.timeSeconds) &&
    value.timeSeconds >= 0
  ) {
    context.timeSeconds = Math.floor(value.timeSeconds);
  }
  return Object.keys(context).length ? context : undefined;
}

function toPositiveInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.round(value);
}

/** Human-readable size, e.g. `1.4 MB`. */
export function formatAssetSize(bytes: number): string {
  if (bytes <= 0) return "—";
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

/** Rough decoded byte length of a base64 `data:` URL. */
export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return 0;
  const payload = dataUrl.length - comma - 1;
  if (payload <= 0) return 0;
  const padding = dataUrl.endsWith("==") ? 2 : dataUrl.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload * 3) / 4) - padding);
}
