import type { Layout, Cell } from "../../core/layouts";
import type { AssetItem } from "../../types";
import { RATIOS, type CollageConfig } from "./config";

export interface Geom {
  W: number;
  H: number;
  rects: { x: number; y: number; w: number; h: number }[];
}

/** Resolve the canvas size + per-cell rects (spacing/margin applied). */
export function buildGeom(
  assets: AssetItem[],
  cfg: CollageConfig,
  layout: Layout,
): Geom {
  const ratio =
    cfg.ratio === "original" && assets[0]
      ? assets[0].width / assets[0].height
      : (RATIOS[cfg.ratio] ?? 1);
  let W: number;
  let H: number;
  if (ratio >= 1) {
    W = cfg.baseSize;
    H = Math.round(cfg.baseSize / ratio);
  } else {
    H = cfg.baseSize;
    W = Math.round(cfg.baseSize * ratio);
  }
  const inner = {
    x: cfg.margin,
    y: cfg.margin,
    w: W - cfg.margin * 2,
    h: H - cfg.margin * 2,
  };
  const rects = layout.map((c: Cell) => ({
    x: inner.x + c.x * inner.w + cfg.spacing / 2,
    y: inner.y + c.y * inner.h + cfg.spacing / 2,
    w: Math.max(1, c.w * inner.w - cfg.spacing),
    h: Math.max(1, c.h * inner.h - cfg.spacing),
  }));
  return { W, H, rects };
}
