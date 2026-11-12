/**
 * Staged asset model — the local "capture cache" (page images, video frames,
 * selection/article screenshots).
 *
 * Assets are kept as base64 `data:` URLs so a capture can travel through
 * extension messaging and be persisted by the host. They are local-only and
 * never synced. The model lives in core so any host can share it; the store is
 * a port implemented per host.
 */

/** Where a staged asset came from. */
export type StagedAssetKind = "image" | "video-frame" | "screenshot";

/**
 * Where a capture sat when it was taken (§I7). Filled in by the capture and
 * the background, never by the user; every field is optional so a capture that
 * has nothing extra to say behaves exactly as before.
 */
export interface StagedAssetContext {
  /** Host page URL (the page, not the image/video file). */
  pageUrl?: string
  /** Host page title at capture time. */
  pageTitle?: string
  /** Selected text, or the nearby paragraph, at capture time. */
  text?: string
  /** Video position in seconds, for the `mm:ss` badge and the `?t=` deep link. */
  timeSeconds?: number
}

/** Full staged record as persisted by the host. */
export interface StagedAsset {
  id: string;
  /** Display name, usually derived from the source file/URL. */
  name: string;
  /** MIME type of `dataUrl`. */
  mime: string;
  width: number;
  height: number;
  /** Full-resolution `data:` URL payload. */
  dataUrl: string;
  /** Small `data:` URL used for list thumbnails. */
  thumb: string;
  /** Page URL the asset was captured from, when known. */
  sourceUrl?: string;
  sourceKind: StagedAssetKind;
  createdAt: string;
  /** Approximate decoded byte size, for display/sorting. */
  size: number;
  /** Capture-time context (§I7); absent on assets captured before it existed. */
  context?: StagedAssetContext;
}

/** List projection: everything except the heavy `dataUrl`. */
export type StagedAssetMeta = Omit<StagedAsset, "dataUrl">;

/** Payload accepted by a capture (id/createdAt assigned by the store). */
export type NewStagedAsset = Omit<StagedAsset, "id" | "createdAt">;

/** Persistence for the local capture cache (never synced). */
export interface StagedAssetStore {
  save(asset: StagedAsset): Promise<void>;
  /** Newest first. */
  list(): Promise<StagedAsset[]>;
  get(id: string): Promise<StagedAsset | undefined>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}
