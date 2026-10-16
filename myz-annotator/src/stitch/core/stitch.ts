import type { AssetItem, StitchParams } from "../types";
import {
  assetToGray,
  detectFixedBars,
  estimateOffset,
  sliceAlong,
} from "./matching";
import type { BarDetection, Gray, MatchResult } from "./matching";
import { alongLength, clampBand } from "./stitch-geometry";

export { buildGeometry, composeStitch, paintStitch } from "./stitch-geometry";

const MATCH_WIDTH = 720;

export interface AnalyzeResult {
  offsets: number[];
  bars: BarDetection;
  matches: MatchResult[];
}

/** Detect the persistent status bar / subtitle / navigation bar across all frames. */
export function autoDetectBars(
  assets: AssetItem[],
  axis: StitchParams["axis"],
): BarDetection {
  if (assets.length < 2) return { top: 0, bottom: 0 };
  const width = Math.min(assets[0].width, 900);
  const grays = assets.map((a) => assetToGray(a, width));
  return detectFixedBars(grays, axis);
}

/**
 * Compute the scroll offset for every consecutive pair using a coarse pass at a reduced
 * width followed by a pixel-accurate refinement at native resolution.
 */
export async function analyzeStitch(
  assets: AssetItem[],
  params: StitchParams,
  onProgress?: (done: number, total: number) => void,
): Promise<AnalyzeResult> {
  const n = assets.length;
  const offsets = new Array(Math.max(0, n - 1)).fill(0);
  const matches: MatchResult[] = [];
  let bars: BarDetection = { top: 0, bottom: 0 };

  if (n < 2 || params.strategy === "concat" || params.strategy === "subtitle") {
    if (n >= 2) bars = autoDetectBars(assets, params.axis);
    onProgress?.(Math.max(0, n - 1), Math.max(0, n - 1));
    return { offsets, bars, matches };
  }

  const cappedWidth = Math.min(assets[0].width, MATCH_WIDTH);
  const scale = cappedWidth / assets[0].width;
  const cappedGrays: Gray[] = assets.map((a) => assetToGray(a, cappedWidth));
  bars = detectFixedBars(cappedGrays, params.axis);

  const useBands = params.fixedTop > 0 || params.fixedBottom > 0;
  const top = useBands
    ? clampBand(
        params.fixedTop,
        Math.min(...assets.map((a) => alongLength(a, params.axis))),
      )
    : 0;
  const bottom = useBands
    ? clampBand(
        params.fixedBottom,
        Math.min(...assets.map((a) => alongLength(a, params.axis))),
      )
    : 0;

  for (let i = 0; i < n - 1; i += 1) {
    const a = assets[i];
    const b = assets[i + 1];
    const lenA = alongLength(a, params.axis);
    const lenB = alongLength(b, params.axis);

    const ga = cappedGrays[i];
    const gb = cappedGrays[i + 1];
    const bandTop = Math.round(top * scale);
    const bandBottom = Math.round(bottom * scale);
    const sa = sliceAlong(
      ga,
      params.axis,
      bandTop,
      (params.axis === "y" ? ga.h : ga.w) - bandBottom,
    );
    const sb = sliceAlong(
      gb,
      params.axis,
      bandTop,
      (params.axis === "y" ? gb.h : gb.w) - bandBottom,
    );

    const coarse = estimateOffset(sa, sb, {
      axis: params.axis,
      diffMode: params.diffMode,
    });

    // Refine at native resolution around the coarse estimate.
    const approx = Math.round(coarse.offset / scale);
    const na = assetToGray(a, a.width);
    const nb = assetToGray(b, b.width);
    const csa = sliceAlong(na, params.axis, top, lenA - bottom);
    const csb = sliceAlong(nb, params.axis, top, lenB - bottom);
    const radius = Math.max(6, Math.ceil(2 / scale) + 3);
    const refined = estimateOffset(csa, csb, {
      axis: params.axis,
      diffMode: params.diffMode,
      window: { center: approx, radius },
    });

    offsets[i] = refined.confidence > 0 ? refined.offset : approx;
    matches[i] = refined;

    onProgress?.(i + 1, n - 1);
    // Yield to keep the UI responsive on long jobs / mobile.
    await Promise.resolve();
  }

  return { offsets, bars, matches };
}
