import {
  computed,
  inject,
  ref,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from "vue";
import { buildGeometry, paintStitch } from "../../core/stitch";
import { useAssetsStore } from "../../stores/assets";
import { readAccentColor } from "../../theme-accent";
import type { PerImageStitch, StitchGeometry, StitchParams } from "../../types";
import { BASE_PARAMS, defaultPerImage } from "./config";
import {
  useScreenshotAnalysis,
  type ScreenshotAnalysis,
} from "./useScreenshotAnalysis";

export interface ScreenshotModeApi extends ScreenshotAnalysis {
  store: ReturnType<typeof useAssetsStore>;
  params: Ref<StitchParams>;
  selected: Ref<number | null>;
  canvasRef: Ref<HTMLCanvasElement | null>;
  geometry: ComputedRef<StitchGeometry>;
  needsAnalysis: ComputedRef<boolean>;
  busy: ComputedRef<boolean>;
  canExport: ComputedRef<boolean>;
  selectedCfg: ComputedRef<PerImageStitch | null>;
  minLen: ComputedRef<number>;
  lenOf: (asset: { width: number; height: number }) => number;
  patchParams: (partial: Partial<StitchParams>) => void;
  patchPerImage: (index: number, patch: Partial<PerImageStitch>) => void;
  patchAllPerImage: (patch: Partial<PerImageStitch>) => void;
  applyPreset: (kind: "first-full" | "all-strip" | "all-full") => void;
  updateOffset: (index: number, value: number) => void;
  drawPreview: (ctx: CanvasRenderingContext2D, scale: number) => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  endDrag: () => void;
}

/** Injection key shared by the screenshot mode shell and its sidebar panels. */
export const SCREENSHOT_MODE_KEY: InjectionKey<ScreenshotModeApi> =
  Symbol("screenshot-mode");

/** Read the screenshot-mode context inside a sidebar panel. */
export function useScreenshotContext(): ScreenshotModeApi {
  const mode = inject(SCREENSHOT_MODE_KEY);
  if (!mode) {
    throw new Error("Screenshot mode context is missing");
  }
  return mode;
}

/** State + actions for the screenshot-stitch editor. */
export function useScreenshotMode(): ScreenshotModeApi {
  const store = useAssetsStore();
  const params = ref<StitchParams>({ ...BASE_PARAMS });
  const selected = ref<number | null>(null);
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  let drag: {
    index: number;
    startY: number;
    startX: number;
    base: number;
  } | null = null;

  const lenOf = (asset: { width: number; height: number }) =>
    params.value.axis === "y" ? asset.height : asset.width;

  const needsAnalysis = computed(
    () => params.value.strategy === "crop" || params.value.strategy === "blend",
  );
  const geometry = computed(() => buildGeometry(store.assets, params.value));
  const minLen = computed(() =>
    store.assets.length
      ? Math.min(...store.assets.map((asset) => lenOf(asset)))
      : 1,
  );
  const selectedCfg = computed(() =>
    selected.value !== null
      ? (params.value.perImage[selected.value] ??
        defaultPerImage(selected.value))
      : null,
  );

  /**
   * Mutate params in place so only the changed fields trigger watchers.
   * Replacing the whole ref would re-run the analysis watcher on every slider
   * move (it would reset the manually tuned offsets).
   */
  const patchParams = (partial: Partial<StitchParams>) => {
    Object.assign(params.value, partial);
  };

  const patchPerImage = (index: number, patch: Partial<PerImageStitch>) => {
    const current = params.value;
    const perImage = store.assets.map(
      (_, i) => current.perImage[i] ?? defaultPerImage(i),
    );
    perImage[index] = { ...perImage[index], ...patch };
    patchParams({ perImage });
  };

  /** Apply one field to every image (batch subtitle controls). */
  const patchAllPerImage = (patch: Partial<PerImageStitch>) => {
    const current = params.value;
    patchParams({
      perImage: store.assets.map((_, i) => ({
        ...(current.perImage[i] ?? defaultPerImage(i)),
        ...patch,
      })),
    });
  };

  const applyPreset = (kind: "first-full" | "all-strip" | "all-full") => {
    const current = params.value;
    patchParams({
      perImage: store.assets.map((_, index) => ({
        ...(current.perImage[index] ?? defaultPerImage(index)),
        mode:
          kind === "all-full"
            ? "full"
            : kind === "all-strip"
              ? "strip"
              : index === 0
                ? "full"
                : "strip",
      })),
    });
  };

  const updateOffset = (index: number, value: number) => {
    const offsets = params.value.offsets.slice();
    offsets[index] = value;
    patchParams({ offsets });
  };

  const analysis = useScreenshotAnalysis({
    store,
    params,
    needsAnalysis,
    patchParams,
    lenOf,
    selected,
  });
  const busy = computed(() => analysis.progress.value !== null);
  const canExport = computed(() => store.assets.length > 0 && !busy.value);

  const drawPreview = (ctx: CanvasRenderingContext2D, scale: number) => {
    paintStitch(ctx, geometry.value, params.value, scale);
    const index = selected.value;
    if (index !== null && geometry.value.placements[index]) {
      const placement = geometry.value.placements[index];
      ctx.save();
      ctx.strokeStyle = readAccentColor();
      ctx.lineWidth = Math.max(1.5, 2 / scale);
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(placement.dx, placement.dy, placement.dw, placement.dh);
      ctx.restore();
    }
  };

  const canvasToContent = (clientX: number, clientY: number) => {
    const canvas = canvasRef.value;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * geometry.value.width,
      y: ((clientY - rect.top) / rect.height) * geometry.value.height,
    };
  };

  const hitPlacement = (x: number, y: number): number | null => {
    const placements = geometry.value.placements;
    for (let i = placements.length - 1; i >= 0; i -= 1) {
      const placement = placements[i];
      if (
        x >= placement.dx &&
        x <= placement.dx + placement.dw &&
        y >= placement.dy &&
        y <= placement.dy + placement.dh
      ) {
        return i;
      }
    }
    return null;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (params.value.strategy !== "subtitle") return;
    const point = canvasToContent(event.clientX, event.clientY);
    if (!point) return;
    const index = hitPlacement(point.x, point.y);
    selected.value = index;
    if (index === null) return;
    const cfg = params.value.perImage[index] ?? defaultPerImage(index);
    const available =
      lenOf(store.assets[index]) - (cfg.trimTop || 0) - (cfg.trimBottom || 0);
    const base =
      cfg.height > 0
        ? cfg.height
        : params.value.subtitleHeight > 0
          ? params.value.subtitleHeight
          : Math.round(available * 0.15);
    drag = {
      index,
      startX: event.clientX,
      startY: event.clientY,
      base: Math.max(1, Math.min(available, base)),
    };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag) return;
    const canvas = canvasRef.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cfg =
      params.value.perImage[drag.index] ?? defaultPerImage(drag.index);
    const available =
      lenOf(store.assets[drag.index]) -
      (cfg.trimTop || 0) -
      (cfg.trimBottom || 0);
    const deltaAxis =
      params.value.axis === "y"
        ? ((event.clientY - drag.startY) / rect.height) * geometry.value.height
        : ((event.clientX - drag.startX) / rect.width) * geometry.value.width;
    const next = Math.max(
      1,
      Math.min(available, Math.round(drag.base - deltaAxis)),
    );
    patchPerImage(drag.index, { height: next, mode: "strip" });
  };

  const endDrag = () => {
    drag = null;
  };

  return {
    store,
    params,
    selected,
    canvasRef,
    geometry,
    needsAnalysis,
    busy,
    canExport,
    selectedCfg,
    minLen,
    lenOf,
    patchParams,
    patchPerImage,
    patchAllPerImage,
    applyPreset,
    updateOffset,
    ...analysis,
    drawPreview,
    onPointerDown,
    onPointerMove,
    endDrag,
  };
}
