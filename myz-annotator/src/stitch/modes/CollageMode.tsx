import { Sparkles, Shuffle } from "@lucide/vue";
import { computed, defineComponent, ref, watch } from "vue";
import AssetTray from "../components/AssetTray";
import DropZone from "../components/DropZone";
import ExportPanel from "../components/ExportPanel";
import PreviewCanvas from "../components/PreviewCanvas";
import {
  Button,
  ColorField,
  Panel,
  Segmented,
  Slider,
  Toggle,
} from "../components/ui";
import {
  drawImageCover,
  get2d,
  makeCanvas,
  roundRectPath,
} from "../core/imageUtils";
import { getLayouts, type Cell, type Layout } from "../core/layouts";
import { useAssetsStore } from "../stores/assets";
import { readAccentColor } from "../theme-accent";
import type { AssetItem } from "../types";

export interface CellTransform {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

export interface CollageConfig {
  ratio: "1:1" | "4:5" | "3:4" | "9:16" | "16:9" | "4:3" | "3:2" | "original";
  baseSize: number;
  spacing: number;
  margin: number;
  radius: number;
  background: string;
  layoutId: string;
  cells: CellTransform[];
}

const DEFAULT_CONFIG: CollageConfig = {
  ratio: "1:1",
  baseSize: 1440,
  spacing: 16,
  margin: 24,
  radius: 24,
  background: "#0e0f13",
  layoutId: "",
  cells: [],
};

const RATIOS: Record<string, number> = {
  "1:1": 1,
  "4:5": 4 / 5,
  "3:4": 3 / 4,
  "9:16": 9 / 16,
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "3:2": 3 / 2,
};

interface Geom {
  W: number;
  H: number;
  rects: { x: number; y: number; w: number; h: number }[];
}

function buildGeom(
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

function paintCollage(
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
    const transform = cfg.cells[i] ?? { offsetX: 0.5, offsetY: 0.5, zoom: 1 };
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

export default defineComponent({
  name: "StitchCollageMode",
  setup() {
    const store = useAssetsStore();
    const config = ref<CollageConfig>({ ...DEFAULT_CONFIG });
    const layoutIndex = ref(0);
    const selected = ref<number | null>(null);

    const canvasRef = ref<HTMLCanvasElement | null>(null);
    let drag: { cell: number; x: number; y: number } | null = null;

    const layouts = computed(() =>
      getLayouts(Math.max(1, store.assets.length)),
    );
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

    // Keep transforms aligned with the number of images.
    watch(
      () => store.assets.length,
      () => {
        const cells = store.assets.map(
          (_, i) =>
            config.value.cells[i] ?? { offsetX: 0.5, offsetY: 0.5, zoom: 1 },
        );
        config.value = { ...config.value, cells };
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
          return { index: i, local: { x: sx - r.x, y: sy - r.y } };
        }
      }
      return null;
    };

    const updateCell = (index: number, patch: Partial<CellTransform>) => {
      const cells = config.value.cells.slice();
      const current = cells[index] ?? { offsetX: 0.5, offsetY: 0.5, zoom: 1 };
      cells[index] = { ...current, ...patch };
      config.value = { ...config.value, cells };
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

    const endDrag = () => {
      drag = null;
    };

    const selectedCell = computed(() =>
      selected.value !== null ? config.value.cells[selected.value] : null,
    );

    return () => {
      const assets = store.assets;
      const cfg = config.value;
      const g = geom.value;
      const selectedIndex = selected.value;
      const sel = selectedCell.value;

      return (
        <div class="mode">
          <div class="mode-main">
            {assets.length === 0 ? (
              <div class="stage-empty">
                <DropZone
                  onFiles={(files: FileList | File[] | null) =>
                    void store.addFiles(files)
                  }
                />
                <div class="tips">
                  <h3>拼图布局</h3>
                  <ol>
                    <li>添加 1–16 张图片，自动套用网格布局。</li>
                    <li>点选某个格子后拖动可平移画面，用滑块缩放。</li>
                    <li>在下方缩略图里点选两张可交换顺序。</li>
                    <li>调整边距、圆角、间距与背景后导出。</li>
                  </ol>
                </div>
              </div>
            ) : (
              <PreviewCanvas
                width={g.W}
                height={g.H}
                draw={drawPreview}
                canvasRef={canvasRef}
                canvasStyle={{ touchAction: "none" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onDoubleClick={() => {
                  if (selectedIndex !== null) {
                    updateCell(selectedIndex, {
                      offsetX: 0.5,
                      offsetY: 0.5,
                      zoom: 1,
                    });
                  }
                }}
              />
            )}
          </div>

          <aside class="mode-side">
            <AssetTray
              assets={assets}
              selectable
              selectedIndex={selectedIndex}
              onAdd={(files: FileList | File[] | null) =>
                void store.addFiles(files)
              }
              onRemove={store.remove}
              onMove={store.move}
              onSelect={(index: number | null) => (selected.value = index)}
              onSwap={store.swap}
            />

            <Panel title="布局">
              <div class="layout-grid">
                {layouts.value.map((option, index) => (
                  <button
                    key={option.id}
                    type="button"
                    class={[
                      "layout-thumb",
                      index === activeIndex.value ? "is-active" : "",
                    ]}
                    title={option.label}
                    onClick={() => (layoutIndex.value = index)}
                  >
                    {option.cells.map((cell, cellIndex) => (
                      <span
                        key={cellIndex}
                        style={{
                          left: `${cell.x * 100}%`,
                          top: `${cell.y * 100}%`,
                          width: `${cell.w * 100}%`,
                          height: `${cell.h * 100}%`,
                        }}
                      />
                    ))}
                  </button>
                ))}
              </div>
              <div class="seg-row-label">画布比例</div>
              <Segmented
                size="sm"
                wrap
                value={cfg.ratio}
                options={[
                  { value: "1:1", label: "1:1" },
                  { value: "4:5", label: "4:5" },
                  { value: "3:4", label: "3:4" },
                  { value: "9:16", label: "9:16" },
                  { value: "16:9", label: "16:9" },
                  { value: "4:3", label: "4:3" },
                  { value: "3:2", label: "3:2" },
                  { value: "original", label: "原始" },
                ]}
                onChange={(ratio: string) =>
                  (config.value = {
                    ...config.value,
                    ratio: ratio as CollageConfig["ratio"],
                  })
                }
              />
              <div class="seg-row-label">输出长边</div>
              <Segmented
                size="sm"
                value={String(cfg.baseSize)}
                options={[
                  { value: "1080", label: "1080" },
                  { value: "1440", label: "1440" },
                  { value: "2160", label: "2160" },
                  { value: "2880", label: "2880" },
                ]}
                onChange={(value: string) =>
                  (config.value = { ...config.value, baseSize: Number(value) })
                }
              />
            </Panel>

            <Panel title="样式">
              <Slider
                label="间距"
                min={0}
                max={120}
                value={cfg.spacing}
                onChange={(spacing: number) =>
                  (config.value = { ...config.value, spacing })
                }
                format={(value: number) => `${value}px`}
              />
              <Slider
                label="外边距"
                min={0}
                max={160}
                value={cfg.margin}
                onChange={(margin: number) =>
                  (config.value = { ...config.value, margin })
                }
                format={(value: number) => `${value}px`}
              />
              <Slider
                label="圆角"
                min={0}
                max={120}
                value={cfg.radius}
                onChange={(radius: number) =>
                  (config.value = { ...config.value, radius })
                }
                format={(value: number) => `${value}px`}
              />
              <Toggle
                label="透明背景"
                checked={cfg.background === ""}
                onChange={(transparent: boolean) =>
                  (config.value = {
                    ...config.value,
                    background: transparent ? "" : "#0e0f13",
                  })
                }
              />
              {cfg.background !== "" ? (
                <ColorField
                  label="背景色"
                  value={cfg.background}
                  onChange={(background: string) =>
                    (config.value = { ...config.value, background })
                  }
                />
              ) : null}
            </Panel>

            {selectedIndex !== null && sel ? (
              <Panel title={`第 ${selectedIndex + 1} 张 · 调整`}>
                <Slider
                  label="缩放"
                  min={1}
                  max={4}
                  step={0.02}
                  value={sel.zoom}
                  onChange={(zoom: number) =>
                    updateCell(selectedIndex, { zoom })
                  }
                  format={(value: number) => `${value.toFixed(2)}×`}
                />
                <Slider
                  label="水平位置"
                  min={0}
                  max={1}
                  step={0.01}
                  value={sel.offsetX}
                  onChange={(offsetX: number) =>
                    updateCell(selectedIndex, { offsetX })
                  }
                  format={(value: number) => `${Math.round(value * 100)}%`}
                />
                <Slider
                  label="垂直位置"
                  min={0}
                  max={1}
                  step={0.01}
                  value={sel.offsetY}
                  onChange={(offsetY: number) =>
                    updateCell(selectedIndex, { offsetY })
                  }
                  format={(value: number) => `${Math.round(value * 100)}%`}
                />
                <Button
                  icon={<Sparkles size={15} />}
                  onClick={() =>
                    updateCell(selectedIndex, {
                      offsetX: 0.5,
                      offsetY: 0.5,
                      zoom: 1,
                    })
                  }
                >
                  重置这一格
                </Button>
              </Panel>
            ) : null}

            {assets.length > 1 ? (
              <Panel title="顺序" defaultOpen={false}>
                <p class="muted-note">
                  在缩略图中点选两张即可交换；也可拖动排序。
                </p>
                <div class="order-actions">
                  <Button
                    icon={<Shuffle size={15} />}
                    onClick={() =>
                      (config.value = {
                        ...config.value,
                        cells: config.value.cells.slice().reverse(),
                      })
                    }
                  >
                    反转移换
                  </Button>
                </div>
              </Panel>
            ) : null}

            {assets.length > 0 ? (
              <Panel title="导出">
                <ExportPanel
                  getCanvas={(scale: number) => {
                    const canvas = makeCanvas(g.W * scale, g.H * scale);
                    const ctx = get2d(canvas);
                    paintCollage(ctx, assets, cfg, g, scale, null);
                    return canvas;
                  }}
                  width={g.W}
                  height={g.H}
                  filenameBase="myz-collage"
                />
              </Panel>
            ) : null}
          </aside>
        </div>
      );
    };
  },
});
