import { Wand2 } from "@lucide/vue";
import { defineComponent } from "vue";
import { Button, Panel, Slider } from "../../components/ui";
import { autoDetectBars } from "../../core/stitch";
import { useScreenshotContext } from "./useScreenshotMode";

/** 分段偏移（逐对）+ 固定栏（高级）. */
export default defineComponent({
  name: "ScreenshotAnalysisPanels",
  setup() {
    const mode = useScreenshotContext();
    return () => {
      const assets = mode.store.assets;
      if (!mode.needsAnalysis.value || assets.length <= 1) return null;
      const p = mode.params.value;
      const minLen = mode.minLen.value;
      return (
        <>
          <Panel title="分段偏移" defaultOpen={false}>
            {mode.matches.value.length === 0 && !mode.busy.value ? (
              <p class="muted-note">尚未分析。</p>
            ) : null}
            {Array.from({ length: assets.length - 1 }).map((_, index) => {
              const aLen = mode.lenOf(assets[index]);
              const bLen = mode.lenOf(assets[index + 1]);
              const maxOff = Math.max(1, Math.min(aLen, bLen) - 1);
              const value = Math.min(
                maxOff,
                Math.max(0, p.offsets[index] ?? 0),
              );
              const overlap = Math.max(0, Math.min(aLen, bLen) - value);
              const overlapPct = Math.round(
                (overlap / Math.min(aLen, bLen)) * 100,
              );
              const match = mode.matches.value[index];
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
                      mode.updateOffset(
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
                      disabled={mode.autoOffsets.value[index] == null}
                      onClick={() =>
                        mode.updateOffset(
                          index,
                          mode.autoOffsets.value[index] ?? value,
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
              onChange={(fixedTop: number) => mode.patchParams({ fixedTop })}
              format={(value: number) => `${value}px`}
            />
            <Slider
              label="底部固定栏"
              min={0}
              max={Math.max(1, Math.round(minLen * 0.4))}
              value={p.fixedBottom}
              onChange={(fixedBottom: number) =>
                mode.patchParams({ fixedBottom })
              }
              format={(value: number) => `${value}px`}
            />
            <Button
              icon={<Wand2 size={15} />}
              disabled={assets.length < 2}
              onClick={() => {
                const bars = autoDetectBars(assets, p.axis);
                mode.patchParams({
                  fixedTop: bars.top,
                  fixedBottom: bars.bottom,
                });
              }}
            >
              自动检测固定栏
            </Button>
          </Panel>
        </>
      );
    };
  },
});
