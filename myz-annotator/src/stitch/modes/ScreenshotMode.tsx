import {
  ArrowDownUp,
  ArrowLeftRight,
  Crop,
  Layers,
  Sparkles,
  SquareStack,
  Wand2,
} from "@lucide/vue";
import { computed, defineComponent, ref, watch, type VNode } from "vue";
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
import type { MatchResult } from "../core/matching";
import {
  analyzeStitch,
  autoDetectBars,
  buildGeometry,
  composeStitch,
  paintStitch,
} from "../core/stitch";
import { useAssetsStore } from "../stores/assets";
import { readAccentColor } from "../theme-accent";
import type { Axis, PerImageStitch, Strategy, StitchParams } from "../types";

const BASE_PARAMS: StitchParams = {
  axis: "y",
  strategy: "crop",
  diffMode: true,
  transition: 64,
  fixedTop: 0,
  fixedBottom: 0,
  gap: 0,
  background: "",
  offsets: [],
  subtitleHeight: 0,
  perImage: [],
};

const STRATEGY_OPTIONS: { value: Strategy; label: string; hint: string }[] = [
  {
    value: "crop",
    label: "无缝裁剪",
    hint: "计算交叉部分并裁掉，拼成长截图（推荐）",
  },
  {
    value: "blend",
    label: "过渡混合",
    hint: "保留少量重叠并做渐变过渡，掩盖色差",
  },
  {
    value: "subtitle",
    label: "字幕堆叠",
    hint: "首张完整，后续只保留底部字幕条，堆叠成字幕长图",
  },
  { value: "concat", label: "简单串联", hint: "不做分析，直接依次排列" },
];

const STRATEGY_ICON: Record<Strategy, VNode> = {
  crop: <Crop size={16} />,
  blend: <Wand2 size={16} />,
  subtitle: <Layers size={16} />,
  concat: <SquareStack size={16} />,
};

function defaultPerImage(index: number): PerImageStitch {
  return {
    mode: index === 0 ? "full" : "strip",
    height: 0,
    trimTop: 0,
    trimBottom: 0,
  };
}

export default defineComponent({
  name: "StitchScreenshotMode",
  setup() {
    const store = useAssetsStore();
    const params = ref<StitchParams>({ ...BASE_PARAMS });
    const autoOffsets = ref<number[]>([]);
    const matches = ref<MatchResult[]>([]);
    const progress = ref<{ done: number; total: number } | null>(null);
    const analyzed = ref(false);
    const analyzeToken = ref(0);
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
      () =>
        params.value.strategy === "crop" || params.value.strategy === "blend",
    );

    const geometry = computed(() => buildGeometry(store.assets, params.value));

    /**
     * Mutate params in place so only the changed fields trigger watchers.
     * Replacing the whole ref would re-run the analysis watcher on every slider
     * move (it would reset the manually tuned offsets).
     */
    const patchParams = (partial: Partial<StitchParams>) => {
      Object.assign(params.value, partial);
    };

    // Keep per-image subtitle config aligned with the asset list.
    watch(
      [
        () => store.assets,
        () => params.value.axis,
        () => params.value.strategy,
      ],
      () => {
        if (params.value.strategy !== "subtitle" || store.assets.length === 0) {
          return;
        }
        const p = params.value;
        const perImage = store.assets.map(
          (_, index) => p.perImage[index] ?? defaultPerImage(index),
        );
        const subtitleHeight =
          p.subtitleHeight > 0
            ? p.subtitleHeight
            : Math.max(1, Math.round(lenOf(store.assets[0]) * 0.15));
        patchParams({ perImage, subtitleHeight });
        if (selected.value !== null && selected.value >= store.assets.length) {
          selected.value = null;
        }
      },
    );

    // Analyze scroll offsets whenever the inputs change.
    let analyzeRun = 0;
    watch(
      () => [
        store.assets,
        params.value.axis,
        params.value.strategy,
        params.value.diffMode,
        params.value.fixedTop,
        params.value.fixedBottom,
        analyzeToken.value,
      ],
      async () => {
        const run = ++analyzeRun;
        const assets = store.assets;
        if (assets.length < 2 || !needsAnalysis.value) {
          patchParams({
            offsets: new Array(Math.max(0, assets.length - 1)).fill(0),
          });
          autoOffsets.value = [];
          matches.value = [];
          analyzed.value = !needsAnalysis.value;
          progress.value = null;
          return;
        }
        progress.value = { done: 0, total: assets.length - 1 };
        try {
          const result = await analyzeStitch(
            assets,
            params.value,
            (done, total) => {
              if (run === analyzeRun) progress.value = { done, total };
            },
          );
          if (run !== analyzeRun) return;
          patchParams({ offsets: result.offsets });
          autoOffsets.value = result.offsets;
          matches.value = result.matches;
          analyzed.value = true;
          progress.value = null;
        } catch {
          if (run === analyzeRun) progress.value = null;
        }
      },
      { immediate: true },
    );

    const busy = computed(() => progress.value !== null);
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

    const updateOffset = (index: number, value: number) => {
      const offsets = params.value.offsets.slice();
      offsets[index] = value;
      patchParams({ offsets });
    };

    const patchPerImage = (index: number, patch: Partial<PerImageStitch>) => {
      const p = params.value;
      const perImage = store.assets.map(
        (_, i) => p.perImage[i] ?? defaultPerImage(i),
      );
      perImage[index] = { ...perImage[index], ...patch };
      patchParams({ perImage });
    };

    /** Apply one field to every image (batch subtitle controls). */
    const patchAllPerImage = (patch: Partial<PerImageStitch>) => {
      const p = params.value;
      patchParams({
        perImage: store.assets.map((_, i) => ({
          ...(p.perImage[i] ?? defaultPerImage(i)),
          ...patch,
        })),
      });
    };

    const applyPreset = (kind: "first-full" | "all-strip" | "all-full") => {
      const p = params.value;
      patchParams({
        perImage: store.assets.map((_, index) => ({
          ...(p.perImage[index] ?? defaultPerImage(index)),
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
        const pl = placements[i];
        if (
          x >= pl.dx &&
          x <= pl.dx + pl.dw &&
          y >= pl.dy &&
          y <= pl.dy + pl.dh
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
          ? ((event.clientY - drag.startY) / rect.height) *
            geometry.value.height
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

    const selectedCfg = computed(() =>
      selected.value !== null
        ? (params.value.perImage[selected.value] ??
          defaultPerImage(selected.value))
        : null,
    );

    return () => {
      const assets = store.assets;
      const p = params.value;
      const geo = geometry.value;
      const strategy = p.strategy;
      const minLen = assets.length
        ? Math.min(...assets.map((a) => lenOf(a)))
        : 1;

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
                  <h3>怎么用</h3>
                  <ol>
                    <li>添加或粘贴多张图片（支持多选 / 拖拽 / 粘贴）。</li>
                    <li>
                      <b>长截图</b>：多张有重叠的滚动截图 →
                      选「无缝裁剪」，自动算出交叉部分拼成长图。
                    </li>
                    <li>
                      <b>字幕拼接</b>：影视截图 →
                      选「字幕堆叠」，首张完整，其余只保留底部字幕条。
                    </li>
                    <li>
                      在预览里点选一张图片即可单独调整它的字幕高度 / 裁切区域。
                    </li>
                  </ol>
                </div>
              </div>
            ) : (
              <div class="stage-wrap">
                <PreviewCanvas
                  width={geo.width}
                  height={geo.height}
                  draw={drawPreview}
                  canvasRef={canvasRef}
                  canvasStyle={
                    strategy === "subtitle"
                      ? { touchAction: "none", cursor: "grab" }
                      : undefined
                  }
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
                {busy.value ? (
                  <div class="stage-overlay">
                    <span class="spinner" />
                    计算中{" "}
                    {progress.value
                      ? `${progress.value.done}/${progress.value.total}`
                      : ""}
                    …
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <aside class="mode-side">
            <AssetTray
              assets={assets}
              onAdd={(files: FileList | File[] | null) =>
                void store.addFiles(files)
              }
              onRemove={store.remove}
              onMove={store.move}
            />

            <Panel
              title="拼接方式"
              actions={
                needsAnalysis.value ? (
                  <Button
                    variant="ghost"
                    icon={<Sparkles size={15} />}
                    disabled={assets.length < 2 || busy.value}
                    onClick={() => (analyzeToken.value += 1)}
                  >
                    重新分析
                  </Button>
                ) : null
              }
            >
              <Segmented
                wrap
                value={strategy}
                options={STRATEGY_OPTIONS.map((s) => ({
                  value: s.value,
                  label: s.label,
                  hint: s.hint,
                  icon: STRATEGY_ICON[s.value],
                }))}
                onChange={(value: string) =>
                  patchParams({ strategy: value as Strategy })
                }
              />
              <p class="muted-note">
                {STRATEGY_OPTIONS.find((s) => s.value === strategy)?.hint}
              </p>

              <div class="seg-row-label">方向</div>
              <Segmented
                value={p.axis}
                options={[
                  {
                    value: "y",
                    label: "纵向",
                    icon: <ArrowDownUp size={16} />,
                  },
                  {
                    value: "x",
                    label: "横向",
                    icon: <ArrowLeftRight size={16} />,
                  },
                ]}
                onChange={(value: string) =>
                  patchParams({ axis: value as Axis })
                }
              />

              {strategy === "concat" || strategy === "subtitle" ? (
                <Slider
                  label="间距"
                  min={0}
                  max={120}
                  value={p.gap}
                  onChange={(gap: number) => patchParams({ gap })}
                  format={(value: number) => `${value}px`}
                />
              ) : null}

              {needsAnalysis.value ? (
                <Toggle
                  label="差值模式"
                  hint="忽略跨图完全相同的区域（状态栏 / 贴顶横幅等静态内容），只按滚动内容对齐"
                  checked={p.diffMode}
                  onChange={(diffMode: boolean) => patchParams({ diffMode })}
                />
              ) : null}

              {strategy === "blend" ? (
                <Slider
                  label="过渡宽度"
                  min={0}
                  max={400}
                  step={4}
                  value={p.transition}
                  onChange={(transition: number) => patchParams({ transition })}
                  format={(value: number) => `${value}px`}
                />
              ) : null}
            </Panel>

            {strategy === "subtitle" ? (
              assets.length === 0 ? (
                <Panel title="字幕堆叠">
                  <p class="muted-note">
                    还没有图片。先添加截图：<b>首张显示完整画面</b>
                    ，之后的每张只保留底部字幕条，堆叠成字幕长图。
                  </p>
                </Panel>
              ) : (
                <>
                  <Panel title="字幕堆叠">
                    <div class="preset-row">
                      <Button onClick={() => applyPreset("first-full")}>
                        首张完整
                      </Button>
                      <Button onClick={() => applyPreset("all-strip")}>
                        全部字幕
                      </Button>
                      <Button onClick={() => applyPreset("all-full")}>
                        全部完整
                      </Button>
                    </div>
                    <Slider
                      label="字幕条默认高度"
                      min={1}
                      max={Math.max(1, Math.round(minLen * 0.6))}
                      value={p.subtitleHeight}
                      onChange={(subtitleHeight: number) =>
                        patchParams({
                          subtitleHeight,
                          perImage: assets.map((_, i) => ({
                            ...(params.value.perImage[i] ?? defaultPerImage(i)),
                            height: 0,
                          })),
                        })
                      }
                      format={(value: number) =>
                        `${value}px ≈ ${Math.round((value / lenOf(assets[0])) * 100)}%`
                      }
                    />
                    <Slider
                      label="底部裁切（全部）"
                      min={0}
                      max={Math.max(1, Math.round(minLen * 0.5))}
                      value={p.perImage[0]?.trimBottom ?? 0}
                      onChange={(trimBottom: number) =>
                        patchAllPerImage({ trimBottom })
                      }
                      format={(value: number) => `${value}px`}
                    />
                    <p class="muted-note">
                      默认 15% 高度。首张显示完整画面，之后每张只保留底部字幕条
                      —— 这就是字幕截图的长图效果。底部裁切可一次设到所有图片，
                      再在「单张调整」里微调。
                    </p>
                  </Panel>

                  <Panel
                    title={`单张调整（${assets.length} 张）`}
                    defaultOpen={assets.length <= 4}
                  >
                    {assets.map((asset, index) => {
                      const cfg = p.perImage[index] ?? defaultPerImage(index);
                      const available =
                        lenOf(asset) -
                        (cfg.trimTop || 0) -
                        (cfg.trimBottom || 0);
                      const effective =
                        cfg.height > 0
                          ? cfg.height
                          : Math.min(available, p.subtitleHeight);
                      return (
                        <div
                          key={asset.id}
                          class={[
                            "img-row",
                            selected.value === index ? "is-selected" : "",
                          ]}
                          onClick={() => (selected.value = index)}
                        >
                          <div class="img-row-head">
                            <span class="img-row-title">
                              <span class="img-row-index">{index + 1}</span>
                              {cfg.mode === "full" ? "完整画面" : "仅字幕条"}
                            </span>
                            <Segmented
                              size="sm"
                              value={cfg.mode}
                              options={[
                                { value: "full", label: "完整" },
                                { value: "strip", label: "字幕" },
                              ]}
                              onChange={(mode: string) =>
                                patchPerImage(index, {
                                  mode: mode as "full" | "strip",
                                })
                              }
                            />
                          </div>
                          {cfg.mode === "strip" ? (
                            <Slider
                              label="字幕条高度"
                              min={1}
                              max={Math.max(1, available)}
                              value={effective}
                              onChange={(height: number) =>
                                patchPerImage(index, { height })
                              }
                              format={(value: number) => `${value}px`}
                            />
                          ) : null}
                          <div class="two-col">
                            <Slider
                              label="裁上"
                              min={0}
                              max={Math.max(1, Math.round(lenOf(asset) * 0.5))}
                              value={cfg.trimTop}
                              onChange={(trimTop: number) =>
                                patchPerImage(index, { trimTop })
                              }
                              format={(value: number) => `${value}px`}
                            />
                            <Slider
                              label="裁下"
                              min={0}
                              max={Math.max(1, Math.round(lenOf(asset) * 0.5))}
                              value={cfg.trimBottom}
                              onChange={(trimBottom: number) =>
                                patchPerImage(index, { trimBottom })
                              }
                              format={(value: number) => `${value}px`}
                            />
                          </div>
                          <button
                            type="button"
                            class="link"
                            onClick={() =>
                              patchPerImage(index, {
                                height: 0,
                                trimTop: 0,
                                trimBottom: 0,
                              })
                            }
                          >
                            重置这一张
                          </button>
                        </div>
                      );
                    })}
                  </Panel>

                  {selected.value !== null && selectedCfg.value ? (
                    <Panel title={`已选中第 ${selected.value + 1} 张`}>
                      <p class="muted-note">
                        在预览里上下拖动这张图片，即可直接拉长 / 缩短字幕条。
                      </p>
                      <Button onClick={() => (selected.value = null)}>
                        取消选中
                      </Button>
                    </Panel>
                  ) : null}
                </>
              )
            ) : null}

            {needsAnalysis.value && assets.length > 1 ? (
              <Panel title="分段偏移" defaultOpen={false}>
                {matches.value.length === 0 && !busy.value ? (
                  <p class="muted-note">尚未分析。</p>
                ) : null}
                {Array.from({ length: assets.length - 1 }).map((_, index) => {
                  const aLen = lenOf(assets[index]);
                  const bLen = lenOf(assets[index + 1]);
                  const maxOff = Math.max(1, Math.min(aLen, bLen) - 1);
                  const value = Math.min(
                    maxOff,
                    Math.max(0, p.offsets[index] ?? 0),
                  );
                  const overlap = Math.max(0, Math.min(aLen, bLen) - value);
                  const overlapPct = Math.round(
                    (overlap / Math.min(aLen, bLen)) * 100,
                  );
                  const match = matches.value[index];
                  return (
                    <div key={index} class="pair">
                      <div class="pair-head">
                        <span class="pair-title">
                          {index + 1} → {index + 2}
                        </span>
                        <span class="pair-meta">
                          重叠 {overlapPct}%
                          {match ? (
                            <span
                              class={[
                                "conf-dot",
                                match.confidence > 0.6
                                  ? "is-good"
                                  : match.confidence > 0.3
                                    ? "is-ok"
                                    : "is-bad",
                              ]}
                              title={`匹配置信度 ${(match.confidence * 100).toFixed(0)}%`}
                            />
                          ) : null}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={maxOff}
                        value={value}
                        onChange={(event: Event) =>
                          updateOffset(
                            index,
                            Number((event.target as HTMLInputElement).value),
                          )
                        }
                      />
                      <div class="pair-foot">
                        <span class="mono">{value}px</span>
                        <button
                          type="button"
                          class="link"
                          disabled={autoOffsets.value[index] == null}
                          onClick={() =>
                            updateOffset(
                              index,
                              autoOffsets.value[index] ?? value,
                            )
                          }
                        >
                          重置为自动
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Panel>
            ) : null}

            {needsAnalysis.value && assets.length > 1 ? (
              <Panel title="固定栏（高级）" defaultOpen={false}>
                <p class="muted-note">
                  每张都相同、只需要保留一次的贴顶 /
                  贴底区域（状态栏、标题栏、导航栏）。如果是每张都变化的
                  <b>字幕</b>，请改用「字幕堆叠」。
                </p>
                <Slider
                  label="顶部固定栏"
                  min={0}
                  max={Math.max(1, Math.round(minLen * 0.4))}
                  value={p.fixedTop}
                  onChange={(fixedTop: number) => patchParams({ fixedTop })}
                  format={(value: number) => `${value}px`}
                />
                <Slider
                  label="底部固定栏"
                  min={0}
                  max={Math.max(1, Math.round(minLen * 0.4))}
                  value={p.fixedBottom}
                  onChange={(fixedBottom: number) =>
                    patchParams({ fixedBottom })
                  }
                  format={(value: number) => `${value}px`}
                />
                <Button
                  icon={<Wand2 size={15} />}
                  disabled={assets.length < 2}
                  onClick={() => {
                    const bars = autoDetectBars(assets, p.axis);
                    patchParams({
                      fixedTop: bars.top,
                      fixedBottom: bars.bottom,
                    });
                  }}
                >
                  自动检测固定栏
                </Button>
              </Panel>
            ) : null}

            <Panel title="画布" defaultOpen={false}>
              <Toggle
                label="透明背景"
                checked={p.background === ""}
                onChange={(transparent: boolean) =>
                  patchParams({ background: transparent ? "" : "#ffffff" })
                }
              />
              {p.background !== "" ? (
                <ColorField
                  label="背景色"
                  value={p.background}
                  onChange={(background: string) => patchParams({ background })}
                />
              ) : null}
              {geo.placements.length > 0 ? (
                <p class="muted-note">
                  画布 {geo.width}×{geo.height} px · {assets.length} 张
                </p>
              ) : null}
            </Panel>

            {assets.length > 0 ? (
              <Panel title="导出">
                <ExportPanel
                  getCanvas={(scale: number) => composeStitch(geo, p, scale)}
                  width={geo.width}
                  height={geo.height}
                  filenameBase={
                    strategy === "subtitle" ? "myz-subtitle" : "myz-stitch"
                  }
                  disabled={
                    !canExport.value || (needsAnalysis.value && !analyzed.value)
                  }
                />
              </Panel>
            ) : null}
          </aside>
        </div>
      );
    };
  },
});
