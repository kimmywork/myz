import { ArrowDownUp, ArrowLeftRight, Sparkles } from "@lucide/vue";
import { defineComponent } from "vue";
import { Button, Panel, Segmented, Slider, Toggle } from "../../components/ui";
import type { Axis, Strategy } from "../../types";
import { STRATEGY_ICON, STRATEGY_OPTIONS } from "./config";
import { useScreenshotContext } from "./useScreenshotMode";

/** 拼接方式 / 方向 / 间距 / 差值模式 / 过渡宽度. */
export default defineComponent({
  name: "ScreenshotStrategyPanel",
  setup() {
    const mode = useScreenshotContext();
    return () => {
      const p = mode.params.value;
      const assets = mode.store.assets;
      const strategy = p.strategy;
      return (
        <Panel
          title="拼接方式"
          actions={
            mode.needsAnalysis.value ? (
              <Button
                variant="ghost"
                icon={<Sparkles size={15} />}
                disabled={assets.length < 2 || mode.busy.value}
                onClick={mode.bumpAnalyze}
              >
                重新分析
              </Button>
            ) : null
          }
        >
          <Segmented
            wrap
            value={strategy}
            options={STRATEGY_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
              hint: option.hint,
              icon: STRATEGY_ICON[option.value],
            }))}
            onChange={(value: string) =>
              mode.patchParams({ strategy: value as Strategy })
            }
          />
          <p class="muted-note">
            {STRATEGY_OPTIONS.find((option) => option.value === strategy)?.hint}
          </p>

          <div class="seg-row-label">方向</div>
          <Segmented
            value={p.axis}
            options={[
              { value: "y", label: "纵向", icon: <ArrowDownUp size={16} /> },
              {
                value: "x",
                label: "横向",
                icon: <ArrowLeftRight size={16} />,
              },
            ]}
            onChange={(value: string) =>
              mode.patchParams({ axis: value as Axis })
            }
          />

          {strategy === "concat" || strategy === "subtitle" ? (
            <Slider
              label="间距"
              min={0}
              max={120}
              value={p.gap}
              onChange={(gap: number) => mode.patchParams({ gap })}
              format={(value: number) => `${value}px`}
            />
          ) : null}

          {mode.needsAnalysis.value ? (
            <Toggle
              label="差值模式"
              hint="忽略跨图完全相同的区域（状态栏 / 贴顶横幅等静态内容），只按滚动内容对齐"
              checked={p.diffMode}
              onChange={(diffMode: boolean) => mode.patchParams({ diffMode })}
            />
          ) : null}

          {strategy === "blend" ? (
            <Slider
              label="过渡宽度"
              min={0}
              max={400}
              step={4}
              value={p.transition}
              onChange={(transition: number) =>
                mode.patchParams({ transition })
              }
              format={(value: number) => `${value}px`}
            />
          ) : null}
        </Panel>
      );
    };
  },
});
