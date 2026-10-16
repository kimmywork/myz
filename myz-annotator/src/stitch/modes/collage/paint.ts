import { drawImageCover, roundRectPath } from "../../core/imageUtils";
import { readAccentColor } from "../../theme-accent";
import type { AssetItem } from "../../types";
import { DEFAULT_CELL, type CollageConfig } from "./config";
import type { Geom } from "./geometry";

/** Paint the collage into `ctx` at `scale`, outlining the selected cell. */
export function paintCollage(
  ctx: CanvasRenderingContext2D,
  assets: AssetItem[],
  cfg: CollageConfig,
  geom: Geom,
  scale: number,
  selected: number | null,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  if (cfg.background) {
    ctx.fillStyle = cfg.background;
    ctx.fillRect(0, 0, geom.W, geom.H);
  }
  geom.rects.forEach((r, i) => {
    const asset = assets[i];
    const transform = cfg.cells[i] ?? DEFAULT_CELL;
    ctx.save();
    roundRectPath(ctx, r.x, r.y, r.w, r.h, cfg.radius);
    ctx.clip();
    if (asset) {
      drawImageCover(
        ctx,
        asset.image,
        asset.width,
        asset.height,
        r.x,
        r.y,
        r.w,
        r.h,
        {
          offsetX: transform.offsetX,
          offsetY: transform.offsetY,
          zoom: transform.zoom,
        },
      );
    } else {
      ctx.fillStyle = "rgba(127,127,127,0.14)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
    if (selected === i) {
      ctx.save();
      ctx.strokeStyle = readAccentColor();
      ctx.lineWidth = Math.max(2, geom.W * 0.004);
      roundRectPath(ctx, r.x, r.y, r.w, r.h, cfg.radius);
      ctx.stroke();
      ctx.restore();
    }
  });
  ctx.restore();
}
