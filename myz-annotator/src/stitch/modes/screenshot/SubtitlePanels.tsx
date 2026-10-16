import { defineComponent } from "vue";
import { Button, Panel, Segmented, Slider } from "../../components/ui";
import { defaultPerImage } from "./config";
import { useScreenshotContext } from "./useScreenshotMode";

/** 字幕堆叠：批量（默认高度 / 底部裁切）+ 单张调整 + 选中提示. */
export default defineComponent({
  name: "ScreenshotSubtitlePanels",
  setup() {
    const mode = useScreenshotContext();
    return () => {
      if (mode.params.value.strategy !== "subtitle") return null;
      const assets = mode.store.assets;
      if (assets.length === 0) {
        return (
          <Panel title="字幕堆叠">
            <p class="muted-note">
              还没有图片。先添加截图：<b>首张显示完整画面</b>
              ，之后的每张只保留底部字幕条，堆叠成字幕长图。
            </p>
          </Panel>
        );
      }
      const p = mode.params.value;
      const minLen = mode.minLen.value;
      return (
        <>
          <Panel title="字幕堆叠">
            <div class="preset-row">
              <Button onClick={() => mode.applyPreset("first-full")}>
                首张完整
              </Button>
              <Button onClick={() => mode.applyPreset("all-strip")}>
                全部字幕
              </Button>
              <Button onClick={() => mode.applyPreset("all-full")}>
                全部完整
              </Button>
            </div>
            <Slider
              label="字幕条默认高度"
              min={1}
              max={Math.max(1, Math.round(minLen * 0.6))}
              value={p.subtitleHeight}
              onChange={(subtitleHeight: number) =>
                mode.patchParams({
                  subtitleHeight,
                  perImage: assets.map((_, i) => ({
                    ...(p.perImage[i] ?? defaultPerImage(i)),
                    height: 0,
                  })),
                })
              }
              format={(value: number) =>
                `${value}px ≈ ${Math.round((value / mode.lenOf(assets[0])) * 100)}%`
              }
            />
            <Slider
              label="底部裁切（全部）"
              min={0}
              max={Math.max(1, Math.round(minLen * 0.5))}
              value={p.perImage[0]?.trimBottom ?? 0}
              onChange={(trimBottom: number) =>
                mode.patchAllPerImage({ trimBottom })
              }
              format={(value: number) => `${value}px`}
            />
            <p class="muted-note">
              默认 15% 高度。首张显示完整画面，之后每张只保留底部字幕条 ——
              这就是字幕截图的长图效果。底部裁切可一次设到所有图片，再在「单张调整」里微调。
            </p>
          </Panel>

          <Panel
            title={`单张调整（${assets.length} 张）`}
            defaultOpen={assets.length <= 4}
          >
            {assets.map((asset, index) => {
              const cfg = p.perImage[index] ?? defaultPerImage(index);
              const available =
                mode.lenOf(asset) - (cfg.trimTop || 0) - (cfg.trimBottom || 0);
              const effective =
                cfg.height > 0
                  ? cfg.height
                  : Math.min(available, p.subtitleHeight);
              return (
                <div
                  key={asset.id}
                  class={[
                    "img-row",
                    mode.selected.value === index ? "is-selected" : "",
                  ]}
                  onClick={() => (mode.selected.value = index)}
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
                      onChange={(value: string) =>
                        mode.patchPerImage(index, {
                          mode: value as "full" | "strip",
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
                        mode.patchPerImage(index, { height })
                      }
                      format={(value: number) => `${value}px`}
                    />
                  ) : null}
                  <div class="two-col">
                    <Slider
                      label="裁上"
                      min={0}
                      max={Math.max(1, Math.round(mode.lenOf(asset) * 0.5))}
                      value={cfg.trimTop}
                      onChange={(trimTop: number) =>
                        mode.patchPerImage(index, { trimTop })
                      }
                      format={(value: number) => `${value}px`}
                    />
                    <Slider
                      label="裁下"
                      min={0}
                      max={Math.max(1, Math.round(mode.lenOf(asset) * 0.5))}
                      value={cfg.trimBottom}
                      onChange={(trimBottom: number) =>
                        mode.patchPerImage(index, { trimBottom })
                      }
                      format={(value: number) => `${value}px`}
                    />
                  </div>
                  <button
                    type="button"
                    class="link"
                    onClick={() =>
                      mode.patchPerImage(index, {
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

          {mode.selected.value !== null && mode.selectedCfg.value ? (
            <Panel title={`已选中第 ${mode.selected.value + 1} 张`}>
              <p class="muted-note">
                在预览里上下拖动这张图片，即可直接拉长 / 缩短字幕条。
              </p>
              <Button onClick={() => (mode.selected.value = null)}>
                取消选中
              </Button>
            </Panel>
          ) : null}
        </>
      );
    };
  },
});
