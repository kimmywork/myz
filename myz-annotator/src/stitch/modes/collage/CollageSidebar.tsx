import { Sparkles, Shuffle } from "@lucide/vue";
import { defineComponent } from "vue";
import AssetTray from "../../components/AssetTray";
import ExportPanel from "../../components/ExportPanel";
import {
  Button,
  ColorField,
  Panel,
  Segmented,
  Slider,
  Toggle,
} from "../../components/ui";
import { useCollageContext } from "./useCollageMode";

const RATIO_OPTIONS = [
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "3:4", label: "3:4" },
  { value: "9:16", label: "9:16" },
  { value: "16:9", label: "16:9" },
  { value: "4:3", label: "4:3" },
  { value: "3:2", label: "3:2" },
  { value: "original", label: "原始" },
];

const BASE_SIZE_OPTIONS = [
  { value: "1080", label: "1080" },
  { value: "1440", label: "1440" },
  { value: "2160", label: "2160" },
  { value: "2880", label: "2880" },
];

/** The collage editor's control column: tray + all panels. */
export default defineComponent({
  name: "CollageSidebar",
  setup() {
    const mode = useCollageContext();
    return () => {
      const assets = mode.store.assets;
      const cfg = mode.config.value;
      const selectedIndex = mode.selected.value;
      const selectedCell = mode.selectedCell.value;
      return (
        <>
          <AssetTray
            assets={assets}
            selectable
            selectedIndex={selectedIndex}
            onAdd={(files: FileList | File[] | null) =>
              void mode.store.addFiles(files)
            }
            onRemove={mode.store.remove}
            onMove={mode.store.move}
            onSelect={(index: number | null) => (mode.selected.value = index)}
            onSwap={mode.store.swap}
          />

          <Panel title="布局">
            <div class="layout-grid">
              {mode.layouts.value.map((option, index) => (
                <button
                  key={option.id}
                  type="button"
                  class={[
                    "layout-thumb",
                    index === mode.activeIndex.value ? "is-active" : "",
                  ]}
                  title={option.label}
                  onClick={() => mode.setLayoutIndex(index)}
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
              options={RATIO_OPTIONS}
              onChange={(ratio: string) =>
                mode.patchConfig({
                  ratio: ratio as typeof cfg.ratio,
                })
              }
            />
            <div class="seg-row-label">输出长边</div>
            <Segmented
              size="sm"
              value={String(cfg.baseSize)}
              options={BASE_SIZE_OPTIONS}
              onChange={(value: string) =>
                mode.patchConfig({ baseSize: Number(value) })
              }
            />
          </Panel>

          <Panel title="样式">
            <Slider
              label="间距"
              min={0}
              max={120}
              value={cfg.spacing}
              onChange={(spacing: number) => mode.patchConfig({ spacing })}
              format={(value: number) => `${value}px`}
            />
            <Slider
              label="外边距"
              min={0}
              max={160}
              value={cfg.margin}
              onChange={(margin: number) => mode.patchConfig({ margin })}
              format={(value: number) => `${value}px`}
            />
            <Slider
              label="圆角"
              min={0}
              max={120}
              value={cfg.radius}
              onChange={(radius: number) => mode.patchConfig({ radius })}
              format={(value: number) => `${value}px`}
            />
            <Toggle
              label="透明背景"
              checked={cfg.background === ""}
              onChange={(transparent: boolean) =>
                mode.patchConfig({ background: transparent ? "" : "#0e0f13" })
              }
            />
            {cfg.background !== "" ? (
              <ColorField
                label="背景色"
                value={cfg.background}
                onChange={(background: string) =>
                  mode.patchConfig({ background })
                }
              />
            ) : null}
          </Panel>

          {selectedIndex !== null && selectedCell ? (
            <Panel title={`第 ${selectedIndex + 1} 张 · 调整`}>
              <Slider
                label="缩放"
                min={1}
                max={4}
                step={0.02}
                value={selectedCell.zoom}
                onChange={(zoom: number) =>
                  mode.updateCell(selectedIndex, { zoom })
                }
                format={(value: number) => `${value.toFixed(2)}×`}
              />
              <Slider
                label="水平位置"
                min={0}
                max={1}
                step={0.01}
                value={selectedCell.offsetX}
                onChange={(offsetX: number) =>
                  mode.updateCell(selectedIndex, { offsetX })
                }
                format={(value: number) => `${Math.round(value * 100)}%`}
              />
              <Slider
                label="垂直位置"
                min={0}
                max={1}
                step={0.01}
                value={selectedCell.offsetY}
                onChange={(offsetY: number) =>
                  mode.updateCell(selectedIndex, { offsetY })
                }
                format={(value: number) => `${Math.round(value * 100)}%`}
              />
              <Button
                icon={<Sparkles size={15} />}
                onClick={() => mode.resetCell(selectedIndex)}
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
                  onClick={mode.reverseCells}
                >
                  反转移换
                </Button>
              </div>
            </Panel>
          ) : null}

          {assets.length > 0 ? (
            <Panel title="导出">
              <ExportPanel
                getCanvas={mode.exportAtScale}
                width={mode.geom.value.W}
                height={mode.geom.value.H}
                filenameBase="myz-collage"
              />
            </Panel>
          ) : null}
        </>
      );
    };
  },
});
