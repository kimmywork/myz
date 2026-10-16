import type {
  AssetItem,
  PerImageStitch,
  Placement,
  StitchGeometry,
  StitchParams,
} from "../types";
import { get2d, makeCanvas } from "./imageUtils";

export function clampBand(value: number, length: number): number {
  return Math.max(0, Math.min(Math.round(value), length - 1));
}

export function alongLength(
  asset: AssetItem,
  axis: StitchParams["axis"],
): number {
  return axis === "y" ? asset.height : asset.width;
}

export function crossLength(
  asset: AssetItem,
  axis: StitchParams["axis"],
): number {
  return axis === "y" ? asset.width : asset.height;
}

function perImage(
  assets: AssetItem[],
  p: StitchParams,
  i: number,
): PerImageStitch {
  return (
    p.perImage[i] ?? {
      mode: i === 0 ? "full" : "strip",
      height: 0,
      trimTop: 0,
      trimBottom: 0,
    }
  );
}

/** Effective subtitle strip height for image `i`, in px. */
function stripHeightFor(len: number, p: StitchParams, i: number): number {
  const override = p.perImage[i]?.height ?? 0;
  if (override > 0) return override;
  if (p.subtitleHeight > 0) return p.subtitleHeight;
  return Math.round(len * 0.15);
}

/**
 * 字幕堆叠: the first frame keeps its full picture, every later frame contributes only its
 * bottom subtitle strip. This mirrors how subtitle screenshots are stacked into a strip comic.
 */
interface Measures {
  n: number;
  lens: number[];
  crosses: number[];
  crossMax: number;
}

/** Along-axis length, cross-axis length and the max cross length for a set. */
function measure(assets: AssetItem[], p: StitchParams): Measures {
  const lens = assets.map((a) => alongLength(a, p.axis));
  const crosses = assets.map((a) => crossLength(a, p.axis));
  return { n: assets.length, lens, crosses, crossMax: Math.max(...crosses, 1) };
}

function buildSubtitleGeometry(
  assets: AssetItem[],
  p: StitchParams,
): StitchGeometry {
  const { n, lens, crossMax } = measure(assets, p);

  const positions = new Array<number>(n).fill(0);
  const parts: { start: number; len: number }[] = [];
  let acc = 0;
  for (let i = 0; i < n; i += 1) {
    const frame = lens[i];
    const cfg = perImage(assets, p, i);
    const trimTop = clampBand(cfg.trimTop, frame);
    const trimBottom = clampBand(cfg.trimBottom, Math.max(0, frame - trimTop));
    const available = Math.max(1, frame - trimTop - trimBottom);
    const mode = cfg.mode;
    let len: number;
    let start: number;
    if (mode === "full") {
      len = available;
      start = trimTop;
    } else {
      len = Math.max(1, Math.min(available, stripHeightFor(available, p, i)));
      start = trimTop + available - len;
    }
    positions[i] = acc;
    parts.push({ start, len });
    acc += len + (i < n - 1 ? p.gap : 0);
  }
  const totalAlong = acc;

  return placementsFromParts(assets, p, positions, parts, crossMax, totalAlong);
}

function placementsFromParts(
  assets: AssetItem[],
  p: StitchParams,
  positions: number[],
  parts: { start: number; len: number }[],
  crossMax: number,
  totalAlong: number,
): StitchGeometry {
  const placements: Placement[] = assets.map((a, i) => {
    const { start, len } = parts[i];
    const cross = p.axis === "y" ? a.width : a.height;
    const crossOff = (crossMax - cross) / 2;
    if (p.axis === "y") {
      return {
        asset: a,
        sx: 0,
        sy: start,
        sw: a.width,
        sh: len,
        dx: crossOff,
        dy: positions[i],
        dw: a.width,
        dh: len,
        blend: 0,
      };
    }
    return {
      asset: a,
      sx: start,
      sy: 0,
      sw: len,
      sh: a.height,
      dx: positions[i],
      dy: crossOff,
      dw: len,
      dh: a.height,
      blend: 0,
    };
  });
  const width = p.axis === "y" ? crossMax : totalAlong;
  const height = p.axis === "y" ? totalAlong : crossMax;
  return { width, height, placements };
}

/** One placement, axis-aware (cross-axis centering is passed in). */
function makePlacement(
  axis: StitchParams["axis"],
  asset: AssetItem,
  alongStart: number,
  alongLen: number,
  alongDest: number,
  crossOff: number,
  blend: number,
): Placement {
  if (axis === "y") {
    return {
      asset,
      sx: 0,
      sy: alongStart,
      sw: asset.width,
      sh: alongLen,
      dx: crossOff,
      dy: alongDest,
      dw: asset.width,
      dh: alongLen,
      blend,
    };
  }
  return {
    asset,
    sx: alongStart,
    sy: 0,
    sw: alongLen,
    sh: asset.height,
    dx: alongDest,
    dy: crossOff,
    dw: alongLen,
    dh: asset.height,
    blend,
  };
}

/** 简单串联: trim per-image, then stack with gaps. */
function buildConcatGeometry(
  assets: AssetItem[],
  p: StitchParams,
  lens: number[],
  crossMax: number,
): StitchGeometry {
  const parts = assets.map((_, i) => {
    const cfg = perImage(assets, p, i);
    const trimTop = clampBand(cfg.trimTop, lens[i]);
    const trimBottom = clampBand(
      cfg.trimBottom,
      Math.max(0, lens[i] - trimTop),
    );
    return { start: trimTop, len: Math.max(1, lens[i] - trimTop - trimBottom) };
  });
  const positions = new Array<number>(assets.length).fill(0);
  let acc = 0;
  for (let i = 0; i < assets.length; i += 1) {
    positions[i] = acc;
    acc += parts[i].len + (i < assets.length - 1 ? p.gap : 0);
  }
  return placementsFromParts(assets, p, positions, parts, crossMax, acc);
}

/** 智能裁剪 / 过渡混合: overlap from the analysed offsets, optional fixed bands. */
function buildCropBlendGeometry(
  assets: AssetItem[],
  p: StitchParams,
  lens: number[],
  crosses: number[],
  crossMax: number,
): StitchGeometry {
  const n = assets.length;
  const offsets = p.offsets;
  const positions = new Array<number>(n).fill(0);
  let acc = 0;
  for (let i = 0; i < n; i += 1) {
    positions[i] = acc;
    if (i < n - 1) acc += Math.max(0, Math.round(offsets[i] ?? 0));
  }
  const totalAlong = positions[n - 1] + lens[n - 1];

  const fixedT = clampBand(p.fixedTop, Math.min(...lens));
  const fixedB = clampBand(p.fixedBottom, Math.min(...lens));
  const useBands = (fixedT > 0 || fixedB > 0) && n > 1;

  const placements: Placement[] = [];
  for (let i = 0; i < n; i += 1) {
    const len = lens[i];
    let alongStart = 0;
    let alongLen = len;
    let alongDest = positions[i];

    if (useBands && fixedT + fixedB < len) {
      if (i === 0) {
        alongLen = len - fixedB;
      } else if (i === n - 1) {
        alongStart = fixedT;
        alongLen = len - fixedT;
        alongDest = positions[i] + fixedT;
      } else {
        alongStart = fixedT;
        alongLen = len - fixedT - fixedB;
        alongDest = positions[i] + fixedT;
      }
    }

    let blend = 0;
    if (p.strategy === "blend" && i > 0) {
      const overlap =
        lens[i - 1] - Math.max(0, Math.round(offsets[i - 1] ?? 0));
      blend = Math.max(0, Math.min(p.transition, overlap));
    }

    const crossOff = (crossMax - crosses[i]) / 2;
    placements.push(
      makePlacement(
        p.axis,
        assets[i],
        alongStart,
        alongLen,
        alongDest,
        crossOff,
        blend,
      ),
    );
  }

  const width = p.axis === "y" ? crossMax : totalAlong;
  const height = p.axis === "y" ? totalAlong : crossMax;
  return { width, height, placements };
}

/** Build the full-resolution layout for the preview and export canvases. */
export function buildGeometry(
  assets: AssetItem[],
  p: StitchParams,
): StitchGeometry {
  const n = assets.length;
  if (n === 0) return { width: 1, height: 1, placements: [] };
  if (p.strategy === "subtitle") return buildSubtitleGeometry(assets, p);

  const { lens, crosses, crossMax } = measure(assets, p);

  return p.strategy === "concat"
    ? buildConcatGeometry(assets, p, lens, crossMax)
    : buildCropBlendGeometry(assets, p, lens, crosses, crossMax);
}

let tempCanvas: HTMLCanvasElement | null = null;

function layoutTo(
  ctx: CanvasRenderingContext2D,
  geo: StitchGeometry,
  p: StitchParams,
  scale: number,
): void {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (p.background) {
    ctx.fillStyle = p.background;
    ctx.fillRect(0, 0, geo.width, geo.height);
  }

  for (const pl of geo.placements) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(pl.dx, pl.dy, pl.dw, pl.dh);
    ctx.clip();

    if (pl.blend > 0) {
      if (!tempCanvas) tempCanvas = document.createElement("canvas");
      if (
        tempCanvas.width !== Math.round(pl.dw) ||
        tempCanvas.height !== Math.round(pl.dh)
      ) {
        tempCanvas.width = Math.max(1, Math.round(pl.dw));
        tempCanvas.height = Math.max(1, Math.round(pl.dh));
      }
      const tctx = get2d(tempCanvas);
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.drawImage(
        pl.asset.image,
        pl.sx,
        pl.sy,
        pl.sw,
        pl.sh,
        0,
        0,
        pl.dw,
        pl.dh,
      );
      const b = Math.min(pl.blend, p.axis === "y" ? pl.dh : pl.dw);
      const grad =
        p.axis === "y"
          ? tctx.createLinearGradient(0, 0, 0, b)
          : tctx.createLinearGradient(0, 0, b, 0);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      tctx.globalCompositeOperation = "destination-out";
      tctx.fillStyle = grad;
      tctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      tctx.globalCompositeOperation = "source-over";
      ctx.drawImage(tempCanvas, pl.dx, pl.dy, pl.dw, pl.dh);
    } else {
      ctx.drawImage(
        pl.asset.image,
        pl.sx,
        pl.sy,
        pl.sw,
        pl.sh,
        pl.dx,
        pl.dy,
        pl.dw,
        pl.dh,
      );
    }
    ctx.restore();
  }
  ctx.restore();
}

/** Compose a stitch result onto a fresh canvas at the requested scale. */
export function composeStitch(
  geo: StitchGeometry,
  p: StitchParams,
  scale = 1,
): HTMLCanvasElement {
  const canvas = makeCanvas(geo.width * scale, geo.height * scale);
  const ctx = get2d(canvas);
  layoutTo(ctx, geo, p, scale);
  return canvas;
}

/** Paint a stitch result into an existing context (used for the live preview). */
export function paintStitch(
  ctx: CanvasRenderingContext2D,
  geo: StitchGeometry,
  p: StitchParams,
  scale = 1,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  layoutTo(ctx, geo, p, scale);
}
