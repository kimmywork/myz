import { ref, watch, type ComputedRef, type Ref } from "vue";
import type { MatchResult } from "../../core/matching";
import { analyzeStitch } from "../../core/stitch";
import type { useAssetsStore } from "../../stores/assets";
import type { StitchParams } from "../../types";
import { defaultPerImage } from "./config";

export interface ScreenshotAnalysis {
  matches: Ref<MatchResult[]>;
  autoOffsets: Ref<number[]>;
  progress: Ref<{ done: number; total: number } | null>;
  analyzed: Ref<boolean>;
  bumpAnalyze: () => void;
}

/**
 * Subtitle-config sync + scroll-offset analysis for the screenshot editor.
 * Kept separate from the mode's rendering state so the analysis lifecycle
 * (cancellation, progress) is one cohesive unit.
 */
export function useScreenshotAnalysis(options: {
  store: ReturnType<typeof useAssetsStore>;
  params: Ref<StitchParams>;
  needsAnalysis: ComputedRef<boolean>;
  patchParams: (partial: Partial<StitchParams>) => void;
  lenOf: (asset: { width: number; height: number }) => number;
  selected: Ref<number | null>;
}): ScreenshotAnalysis {
  const { params, needsAnalysis, patchParams, lenOf, selected } = options;
  const matches = ref<MatchResult[]>([]);
  const autoOffsets = ref<number[]>([]);
  const progress = ref<{ done: number; total: number } | null>(null);
  const analyzed = ref(false);
  const analyzeToken = ref(0);
  const bumpAnalyze = () => {
    analyzeToken.value += 1;
  };

  const assets = () => options.store.assets;

  // Keep per-image subtitle config aligned with the asset list.
  watch(
    [() => assets(), () => params.value.axis, () => params.value.strategy],
    () => {
      const list = assets();
      if (params.value.strategy !== "subtitle" || list.length === 0) {
        return;
      }
      const current = params.value;
      const perImage = list.map(
        (_, index) => current.perImage[index] ?? defaultPerImage(index),
      );
      const subtitleHeight =
        current.subtitleHeight > 0
          ? current.subtitleHeight
          : Math.max(1, Math.round(lenOf(list[0]) * 0.15));
      patchParams({ perImage, subtitleHeight });
      if (selected.value !== null && selected.value >= list.length) {
        selected.value = null;
      }
    },
  );

  // Analyze scroll offsets whenever the inputs change.
  let run = 0;
  watch(
    () => [
      assets(),
      params.value.axis,
      params.value.strategy,
      params.value.diffMode,
      params.value.fixedTop,
      params.value.fixedBottom,
      analyzeToken.value,
    ],
    async () => {
      const current = ++run;
      const list = assets();
      if (list.length < 2 || !needsAnalysis.value) {
        patchParams({
          offsets: new Array(Math.max(0, list.length - 1)).fill(0),
        });
        autoOffsets.value = [];
        matches.value = [];
        analyzed.value = !needsAnalysis.value;
        progress.value = null;
        return;
      }
      progress.value = { done: 0, total: list.length - 1 };
      try {
        const result = await analyzeStitch(
          list,
          params.value,
          (done, total) => {
            if (current === run) progress.value = { done, total };
          },
        );
        if (current !== run) return;
        patchParams({ offsets: result.offsets });
        autoOffsets.value = result.offsets;
        matches.value = result.matches;
        analyzed.value = true;
        progress.value = null;
      } catch {
        if (current === run) progress.value = null;
      }
    },
    { immediate: true },
  );

  return { matches, autoOffsets, progress, analyzed, bumpAnalyze };
}
