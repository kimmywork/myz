import type { Axis } from "../types";
import { imageToGray } from "./gray";
import type { Gray } from "./gray";

export { imageToGray };
export type { Gray };

export interface MatchOptions {
  axis: Axis;
  /**
   * Diff mode (差值模式): weight the comparison by how much the two frames differ at the
   * *same* coordinates. Pixels that never change between frames (a static status bar,
   * a sticky subtitle, a fixed navigation bar) get weight 0, so only the moving content
   * drives the alignment.
   */
  diffMode: boolean;
  /** Minimum overlap to consider, as a fraction of the frame length (default 0.02). */
  minOverlapRatio?: number;
  /**
   * Restrict the search to a tight window around `center` (native px). Used for the
   * pixel-accurate refinement pass after a coarse estimate.
   */
  window?: { center: number; radius: number };
}

export interface MatchResult {
  /** Scroll distance in px: how far frame B advanced relative to frame A. */
  offset: number;
  /** Mean absolute error (0..255) at the chosen offset. Lower is better. */
  score: number;
  /** 0..1 heuristic: how much better the best match is than a random alignment. */
  confidence: number;
  /** Overlap length / frame length. */
  overlapRatio: number;
}

/** Crop a grayscale image to a sub-range along the scroll axis (used to skip static bands). */
export function sliceAlong(
  g: Gray,
  axis: Axis,
  start: number,
  end: number,
): Gray {
  const a0 = Math.max(0, Math.floor(start));
  const a1 = Math.min(axis === "y" ? g.h : g.w, Math.ceil(end));
  if (axis === "y") {
    const h = Math.max(0, a1 - a0);
    const data = new Float32Array(g.w * h);
    data.set(g.data.subarray(a0 * g.w, a1 * g.w));
    return { w: g.w, h, data };
  }
  const w = Math.max(0, a1 - a0);
  const data = new Float32Array(w * g.h);
  for (let y = 0; y < g.h; y += 1) {
    const rowStart = y * g.w + a0;
    data.set(g.data.subarray(rowStart, rowStart + w), y * w);
  }
  return { w, h: g.h, data };
}

/**
 * Box-filtered downsample by an integer factor. Box averaging (instead of point
 * sampling) is what makes the coarse pass reliable: it removes the high-frequency
 * aliasing that otherwise produces bogus correlation minima.
 */
function downsample(g: Gray, f: number): Gray {
  if (f <= 1) return g;
  const nw = Math.max(1, Math.floor(g.w / f));
  const nh = Math.max(1, Math.floor(g.h / f));
  const data = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y += 1) {
    for (let x = 0; x < nw; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = 0; dy < f; dy += 1) {
        const yy = y * f + dy;
        if (yy >= g.h) break;
        const row = yy * g.w;
        for (let dx = 0; dx < f; dx += 1) {
          const xx = x * f + dx;
          if (xx >= g.w) break;
          sum += g.data[row + xx];
          count += 1;
        }
      }
      data[y * nw + x] = count ? sum / count : 0;
    }
  }
  return { w: nw, h: nh, data };
}

function downsampleWeight(weight: Gray, f: number): Gray {
  const small = downsample(weight, f);
  for (let i = 0; i < small.data.length; i += 1) {
    small.data[i] = small.data[i] >= 0.5 ? 1 : 0;
  }
  return small;
}

interface Level {
  ga: Gray;
  gb: Gray;
  wt: Gray | null;
  /** Native pixels per level pixel along the scroll axis. */
  scale: number;
}

function along(g: Gray, axis: Axis): number {
  return axis === "y" ? g.h : g.w;
}

function evalLevel(lv: Level, off: number, axis: Axis): number {
  const a = lv.ga;
  const b = lv.gb;
  const wt = lv.wt;
  let sum = 0;
  let wsum = 0;
  let count = 0;

  if (axis === "y") {
    const w = Math.min(a.w, b.w);
    const yStart = off;
    const yEnd = Math.min(a.h, b.h + off);
    for (let y = yStart; y < yEnd; y += 1) {
      const aRow = y * a.w;
      const bRow = (y - off) * b.w;
      if (wt) {
        for (let x = 0; x < w; x += 1) {
          const wgt = wt.data[aRow + x];
          if (wgt === 0) continue;
          sum += Math.abs(a.data[aRow + x] - b.data[bRow + x]);
          wsum += wgt;
        }
      } else {
        for (let x = 0; x < w; x += 1) {
          sum += Math.abs(a.data[aRow + x] - b.data[bRow + x]);
        }
        count += w;
      }
    }
  } else {
    const h = Math.min(a.h, b.h);
    const xStart = off;
    const xEnd = Math.min(a.w, b.w + off);
    for (let x = xStart; x < xEnd; x += 1) {
      if (wt) {
        for (let y = 0; y < h; y += 1) {
          const ai = y * a.w + x;
          const wgt = wt.data[ai];
          if (wgt === 0) continue;
          sum += Math.abs(a.data[ai] - b.data[y * b.w + (x - off)]);
          wsum += wgt;
        }
      } else {
        for (let y = 0; y < h; y += 1) {
          sum += Math.abs(a.data[y * a.w + x] - b.data[y * b.w + (x - off)]);
        }
        count += h;
      }
    }
  }

  if (wt) return wsum > 0 ? sum / wsum : Infinity;
  return count > 0 ? sum / count : Infinity;
}

function searchRange(
  lv: Level,
  axis: Axis,
  lo: number,
  hi: number,
): { offset: number; err: number } {
  let best = lo;
  let bestErr = Infinity;
  for (let off = lo; off <= hi; off += 1) {
    const err = evalLevel(lv, off, axis);
    if (err < bestErr) {
      bestErr = err;
      best = off;
    }
  }
  return { offset: best, err: bestErr };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** 1 where the two frames differ, 0 where they are identical (static overlays). */
function buildDiffWeight(a: Gray, b: Gray): Gray | null {
  const w = Math.min(a.w, b.w);
  const h = Math.min(a.h, b.h);
  if (w <= 0 || h <= 0) return null;
  const weight = new Float32Array(a.w * a.h);
  let active = 0;
  const threshold = 14;
  for (let y = 0; y < h; y += 1) {
    const aRow = y * a.w;
    const bRow = y * b.w;
    for (let x = 0; x < w; x += 1) {
      const d = Math.abs(a.data[aRow + x] - b.data[bRow + x]);
      if (d > threshold) {
        weight[aRow + x] = 1;
        active += 1;
      }
    }
  }
  if (active < w * h * 0.01) return null; // nothing to distinguish -> fall back
  return { w: a.w, h: a.h, data: weight };
}

/** Box-filtered pyramid (8×, 4×, 2×, 1×) with optional diff weights. */
function buildPyramid(a: Gray, b: Gray, weight: Gray | null): Level[] {
  return [8, 4, 2, 1].map((factor) => ({
    ga: downsample(a, factor),
    gb: downsample(b, factor),
    wt: weight ? downsampleWeight(weight, factor) : null,
    scale: factor,
  }));
}

/** Full-range search at the coarsest level, then ±3px refinement down to native. */
function searchPyramid(
  levels: Level[],
  axis: Axis,
  searchMax: number,
): { offset: number; err: number } {
  let estimate = -1;
  let best = { offset: 0, err: Infinity };
  for (const level of levels) {
    const levelLen = along(level.ga, axis);
    const levelMax = Math.max(1, Math.min(levelLen, along(level.gb, axis)) - 1);
    const levelSearchMax = Math.max(
      1,
      Math.min(levelMax, Math.floor(searchMax / level.scale)),
    );
    let lo = 1;
    let hi = levelSearchMax;
    if (estimate >= 0) {
      const center = estimate / level.scale;
      lo = Math.max(1, Math.floor(center) - 3);
      hi = Math.min(levelSearchMax, Math.ceil(center) + 3);
      if (hi < lo) {
        lo = 1;
        hi = levelSearchMax;
      }
    }
    const result = searchRange(level, axis, lo, hi);
    estimate = result.offset * level.scale;
    best = { offset: Math.round(estimate), err: result.err };
  }
  return best;
}

/** Pixel-accurate search restricted to a window around a coarse estimate. */
function searchWindow(
  a: Gray,
  b: Gray,
  weight: Gray | null,
  axis: Axis,
  searchMax: number,
  window: { center: number; radius: number },
): { offset: number; err: number } {
  const level: Level = { ga: a, gb: b, wt: weight, scale: 1 };
  const lo = Math.max(1, Math.round(window.center - window.radius));
  const hi = Math.min(searchMax, Math.round(window.center + window.radius));
  const result = searchRange(level, axis, Math.min(lo, hi), hi);
  return { offset: result.offset, err: result.err };
}

/** Peak ratio at 1/4 resolution: best offset vs the best unrelated offset. */
function peakConfidence(
  a: Gray,
  b: Gray,
  weight: Gray | null,
  axis: Axis,
  searchMax: number,
): number {
  const level: Level = {
    ga: downsample(a, 4),
    gb: downsample(b, 4),
    wt: weight ? downsampleWeight(weight, 4) : null,
    scale: 4,
  };
  const confLen = along(level.ga, axis);
  const confMax = Math.max(1, Math.min(confLen, along(level.gb, axis)) - 1);
  const confSearchMax = Math.max(
    1,
    Math.min(confMax, Math.floor(searchMax / 4)),
  );
  const guard = Math.max(2, Math.round(0.06 * confLen));
  let minOff = 1;
  let minErr = Infinity;
  for (let off = 1; off <= confSearchMax; off += 1) {
    const e = evalLevel(level, off, axis);
    if (e < minErr) {
      minErr = e;
      minOff = off;
    }
  }
  let secondErr = Infinity;
  for (let off = 1; off <= confSearchMax; off += 1) {
    if (Math.abs(off - minOff) <= guard) continue;
    const e = evalLevel(level, off, axis);
    if (e < secondErr) secondErr = e;
  }
  if (!Number.isFinite(minErr)) return 0;
  if (secondErr > 0 && Number.isFinite(secondErr)) {
    return clamp01(1 - minErr / secondErr);
  }
  return 1;
}

/**
 * Find the translation offset between two frames captured while scrolling along one axis.
 *
 * Strategy: build a box-filtered image pyramid, search the *entire* range at the coarsest
 * level, then refine within a small window at each finer level down to native resolution.
 * This mirrors the coarse-to-fine spirit of the original app's phase correlation while
 * staying robust against periodic textures and static overlays.
 */
export function estimateOffset(
  a: Gray,
  b: Gray,
  opts: MatchOptions,
): MatchResult {
  const axis = opts.axis;
  const lenA = along(a, axis);
  const lenB = along(b, axis);
  const minLen = Math.min(lenA, lenB);
  const minOverlapRatio = opts.minOverlapRatio ?? 0.15;
  // Never look for an overlap smaller than `minOverlapRatio`: tiny overlaps match by
  // chance, which is the classic failure mode of naive template matching.
  const searchMax = Math.max(
    1,
    Math.min(minLen - 1, Math.floor(minLen * (1 - minOverlapRatio))),
  );

  const weight = opts.diffMode ? buildDiffWeight(a, b) : null;

  const { offset: bestNative, err: bestErr } = opts.window
    ? searchWindow(a, b, weight, axis, searchMax, opts.window)
    : searchPyramid(buildPyramid(a, b, weight), axis, searchMax);

  const confidence = peakConfidence(a, b, weight, axis, searchMax);

  const overlap = Math.max(0, minLen - bestNative);
  const overlapRatio = overlap / minLen;

  // Reject uncertain or too-small overlaps: place the frames back-to-back instead.
  if (
    overlapRatio < minOverlapRatio ||
    !Number.isFinite(bestErr) ||
    confidence < 0.12
  ) {
    return { offset: minLen, score: bestErr, confidence, overlapRatio: 0 };
  }

  return { offset: bestNative, score: bestErr, confidence, overlapRatio };
}

export interface BarDetection {
  top: number;
  bottom: number;
}

/**
 * Detect the static bands (status bar / subtitle on top, navigation bar at the bottom)
 * that are identical across *every* frame. Rows whose content never changes cannot be
 * part of the scrolling content, so they should be kept once instead of repeated.
 */
export function detectFixedBars(
  grays: Gray[],
  axis: Axis,
  threshold = 7,
): BarDetection {
  const none: BarDetection = { top: 0, bottom: 0 };
  if (grays.length < 2) return none;
  const len = along(grays[0], axis);
  const cross = axis === "y" ? grays[0].w : grays[0].h;
  const maxBand = Math.floor(len * 0.25);

  const rowMaxDiff = new Float32Array(len);
  for (let i = 1; i < grays.length; i += 1) {
    const prev = grays[i - 1];
    const cur = grays[i];
    const l = Math.min(len, along(prev, axis), along(cur, axis));
    const c = Math.min(
      cross,
      axis === "y" ? Math.min(prev.w, cur.w) : Math.min(prev.h, cur.h),
    );
    for (let p = 0; p < l; p += 1) {
      let acc = 0;
      for (let q = 0; q < c; q += 1) {
        const pa =
          axis === "y" ? prev.data[p * prev.w + q] : prev.data[q * prev.w + p];
        const pb =
          axis === "y" ? cur.data[p * cur.w + q] : cur.data[q * cur.w + p];
        acc += Math.abs(pa - pb);
      }
      const mean = acc / Math.max(1, c);
      if (mean > rowMaxDiff[p]) rowMaxDiff[p] = mean;
    }
  }

  let top = 0;
  while (top < maxBand && rowMaxDiff[top] <= threshold) top += 1;
  let bottom = 0;
  while (bottom < maxBand && rowMaxDiff[len - 1 - bottom] <= threshold)
    bottom += 1;
  if (top < 4) top = 0;
  if (bottom < 4) bottom = 0;
  return { top, bottom };
}

/** Grayscale of an image scaled to `targetWidth` (aspect preserved). */
export function assetToGray(
  asset: { image: HTMLImageElement; width: number; height: number },
  targetWidth?: number,
): Gray {
  const w = Math.max(1, Math.round(targetWidth ?? asset.width));
  const h = Math.max(1, Math.round((asset.height / asset.width) * w));
  return imageToGray(asset.image, w, h);
}
