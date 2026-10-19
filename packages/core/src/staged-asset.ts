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
