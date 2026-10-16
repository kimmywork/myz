export interface AssetItem {
  id: string;
  name: string;
  url: string;
  image: HTMLImageElement;
  width: number;
  height: number;
  type: string;
}

export type Mode = "screenshot" | "collage" | "showcase";

/** Scroll direction of the source screenshots. */
export type Axis = "y" | "x";

/**
 * How the images are merged:
 * - `concat`   简单串联：no analysis, stack the images as-is.
 * - `crop`     智能裁剪：align by the detected overlap, then crop it away (seamless long shot).
 * - `blend`    过渡混合：same alignment, but cross-fade the seam so tiny color/AA differences vanish.
 * - `subtitle` 字幕堆叠：first frame in full, every later frame contributes only its bottom
 *              subtitle strip (default 15%). This is how subtitle screenshots are stacked.
 */
export type Strategy = "concat" | "crop" | "blend" | "subtitle";

/** Per-image settings for the subtitle-stacking strategy. */
export interface PerImageStitch {
  /** `full` shows the whole frame, `strip` keeps only the bottom band. */
  mode: "full" | "strip";
  /** Strip height in px; 0 means "use the global value". */
  height: number;
  /** Rows cropped from the top (along-start) of this frame. */
  trimTop: number;
  /** Rows cropped from the bottom (along-end) of this frame. */
  trimBottom: number;
}

export interface StitchParams {
  axis: Axis;
  strategy: Strategy;
  /** Ignore pixels that are identical across both frames (static overlays) while matching. */
  diffMode: boolean;
  /** Cross-fade width in px for the `blend` strategy. */
  transition: number;
  /**
   * Band kept once at the start (status bar / sticky header). These rows are identical
   * in every frame, so only the first copy is kept. 0 disables it.
   */
  fixedTop: number;
  /** Band kept once at the end (navigation bar / footer toolbar). 0 disables it. */
  fixedBottom: number;
  /** Gap between images, in px. */
  gap: number;
  background: string;
  /** Scroll offset (in px) for every consecutive pair, length = images - 1. */
  offsets: number[];
  /** Global default subtitle strip height for the subtitle strategy, in px. */
  subtitleHeight: number;
  /** Per-image subtitle behaviour, indexed by image order. */
  perImage: PerImageStitch[];
}

export interface Placement {
  asset: AssetItem;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  /** Length (along the scroll axis) of the cross-fade at this placement's leading edge. */
  blend: number;
}

export interface StitchGeometry {
  width: number;
  height: number;
  placements: Placement[];
}
