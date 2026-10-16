import {
  computed,
  inject,
  ref,
  watch,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from "vue";
import { get2d, makeCanvas } from "../../core/imageUtils";
import { getLayouts, type LayoutOption } from "../../core/layouts";
import { useAssetsStore } from "../../stores/assets";
import {
  DEFAULT_CONFIG,
  type CellTransform,
  type CollageConfig,
} from "./config";
import { buildGeom, type Geom } from "./geometry";
import { paintCollage } from "./paint";

export interface CollageModeApi {
  store: ReturnType<typeof useAssetsStore>;
  config: Ref<CollageConfig>;
  layoutIndex: Ref<number>;
  selected: Ref<number | null>;
  canvasRef: Ref<HTMLCanvasElement | null>;
  layouts: ComputedRef<LayoutOption[]>;
  activeIndex: ComputedRef<number>;
  geom: ComputedRef<Geom>;
  selectedCell: ComputedRef<CellTransform | null>;
  patchConfig: (patch: Partial<CollageConfig>) => void;
  setLayoutIndex: (index: number) => void;
  updateCell: (index: number, patch: Partial<CellTransform>) => void;
  resetCell: (index: number) => void;
  reverseCells: () => void;
  drawPreview: (ctx: CanvasRenderingContext2D, scale: number) => void;
  exportAtScale: (scale: number) => HTMLCanvasElement;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onDoubleClick: () => void;
  endDrag: () => void;
}

export const COLLAGE_MODE_KEY: InjectionKey<CollageModeApi> =
  Symbol("collage-mode");

export function useCollageContext(): CollageModeApi {
  const mode = inject(COLLAGE_MODE_KEY);
  if (!mode) {
    throw new Error("Collage mode context is missing");
  }
  return mode;
}

/** State + actions for the collage editor. */
export function useCollageMode(): CollageModeApi {
  const store = useAssetsStore();
  const config = ref<CollageConfig>({ ...DEFAULT_CONFIG });
  const layoutIndex = ref(0);
  const selected = ref<number | null>(null);
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  let drag: { cell: number; x: number; y: number } | null = null;

  const layouts = computed(() => getLayouts(Math.max(1, store.assets.length)));
  const activeIndex = computed(() =>
    Math.min(layoutIndex.value, layouts.value.length - 1),
  );
  const layout = computed(
    () =>
      layouts.value[activeIndex.value]?.cells ?? [{ x: 0, y: 0, w: 1, h: 1 }],
  );
  const geom = computed(() =>
    buildGeom(store.assets, config.value, layout.value),
  );
  const selectedCell = computed(() =>
    selected.value !== null ? config.value.cells[selected.value] : null,
  );

  const patchConfig = (patch: Partial<CollageConfig>) => {
    config.value = { ...config.value, ...patch };
  };

  const setLayoutIndex = (index: number) => {
    layoutIndex.value = index;
  };

  const updateCell = (index: number, patch: Partial<CellTransform>) => {
    const cells = config.value.cells.slice();
    const current = cells[index] ?? { offsetX: 0.5, offsetY: 0.5, zoom: 1 };
    cells[index] = { ...current, ...patch };
    patchConfig({ cells });
  };

  const resetCell = (index: number) => {
    updateCell(index, { offsetX: 0.5, offsetY: 0.5, zoom: 1 });
  };

  const reverseCells = () => {
    patchConfig({ cells: config.value.cells.slice().reverse() });
  };

  // Keep transforms aligned with the number of images.
  watch(
    () => store.assets.length,
    () => {
      const cells = store.assets.map(
        (_, i) =>
          config.value.cells[i] ?? { offsetX: 0.5, offsetY: 0.5, zoom: 1 },
      );
      patchConfig({ cells });
      if (selected.value !== null && selected.value >= store.assets.length) {
        selected.value = null;
      }
    },
  );

  watch(
    () => layouts.value.length,
    (length) => {
      if (layoutIndex.value > length - 1) layoutIndex.value = length - 1;
    },
  );

  const drawPreview = (ctx: CanvasRenderingContext2D, scale: number) => {
    paintCollage(
      ctx,
      store.assets,
      config.value,
      geom.value,
      scale,
      selected.value,
    );
  };

  const exportAtScale = (scale: number): HTMLCanvasElement => {
    const canvas = makeCanvas(geom.value.W * scale, geom.value.H * scale);
    const ctx = get2d(canvas);
    paintCollage(ctx, store.assets, config.value, geom.value, scale, null);
    return canvas;
  };

  const pointToCell = (clientX: number, clientY: number) => {
    const canvas = canvasRef.value;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * geom.value.W;
    const sy = ((clientY - rect.top) / rect.height) * geom.value.H;
    const rects = geom.value.rects;
    for (let i = 0; i < rects.length; i += 1) {
      const r = rects[i];
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) {
        return { index: i };
      }
    }
    return null;
  };

  const onPointerDown = (event: PointerEvent) => {
    const hit = pointToCell(event.clientX, event.clientY);
    if (!hit) return;
    selected.value = hit.index;
    drag = { cell: hit.index, x: event.clientX, y: event.clientY };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drag) return;
    const r = geom.value.rects[drag.cell];
    const canvas = canvasRef.value;
    if (!r || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dCanvasX = ((event.clientX - drag.x) / rect.width) * geom.value.W;
    const dCanvasY = ((event.clientY - drag.y) / rect.height) * geom.value.H;
    drag.x = event.clientX;
    drag.y = event.clientY;
    const current = config.value.cells[drag.cell] ?? {
      offsetX: 0.5,
      offsetY: 0.5,
      zoom: 1,
    };
    updateCell(drag.cell, {
      offsetX: Math.max(0, Math.min(1, current.offsetX - dCanvasX / r.w)),
      offsetY: Math.max(0, Math.min(1, current.offsetY - dCanvasY / r.h)),
    });
  };

  const onDoubleClick = () => {
    if (selected.value !== null) resetCell(selected.value);
  };

  const endDrag = () => {
    drag = null;
  };

  return {
    store,
    config,
    layoutIndex,
    selected,
    canvasRef,
    layouts,
    activeIndex,
    geom,
    selectedCell,
    patchConfig,
    setLayoutIndex,
    updateCell,
    resetCell,
    reverseCells,
    drawPreview,
    exportAtScale,
    onPointerDown,
    onPointerMove,
    onDoubleClick,
    endDrag,
  };
}
