import { computed, defineComponent, ref } from "vue";
import AssetTray from "../components/AssetTray";
import ExportPanel from "../components/ExportPanel";
import PreviewCanvas from "../components/PreviewCanvas";
import {
  ColorField,
  Panel,
  Segmented,
  Select,
  Slider,
  TextInput,
  Toggle,
} from "../components/ui";
import {
  DEFAULT_SHOWCASE,
  SHOWCASE_SIZES,
  composeShowcase,
  type ShowcaseParams,
  type ShowcaseTemplate,
} from "../core/showcase";
import { useAssetsStore } from "../stores/assets";
import { readAccentColor, readAccentHoverColor } from "../theme-accent";
import ModeEmptyState from "./ModeEmptyState";

const GRADIENTS: { from: string; to: string; angle: number }[] = [
  { from: "#5b8cff", to: "#7c5cff", angle: 135 },
  { from: "#ff7a59", to: "#ff3d81", angle: 135 },
  { from: "#12c2e9", to: "#26d0ce", angle: 135 },
  { from: "#f7971e", to: "#ffd200", angle: 135 },
  { from: "#232526", to: "#414345", angle: 135 },
  { from: "#11998e", to: "#38ef7d", angle: 135 },
  { from: "#fdfbfb", to: "#ebedee", angle: 135 },
  { from: "#fc466b", to: "#3f5efb", angle: 135 },
];

export default defineComponent({
  name: "StitchShowcaseMode",
  setup() {
    const store = useAssetsStore();
    // Seed the default gradient from the live plugin accent so a fresh
    // showcase already matches the active scheme.
    const params = ref<ShowcaseParams>({
      ...DEFAULT_SHOWCASE,
      bgFrom: readAccentColor(),
      bgTo: readAccentHoverColor(),
    });
    const selected = ref<number | null>(null);

    const size = computed(
      () =>
        SHOWCASE_SIZES.find((s) => s.id === params.value.sizeId) ??
        SHOWCASE_SIZES[0],
    );

    const set = (patch: Partial<ShowcaseParams>) => {
      params.value = { ...params.value, ...patch };
    };

    // Order assets so the selected one is drawn first / centered when relevant.
    const orderedAssets = computed(() => {
      const assets = store.assets;
      if (selected.value === null) return assets;
      const next = assets.slice();
      const [item] = next.splice(selected.value, 1);
      next.unshift(item);
      return next;
    });

    return () => {
      const assets = store.assets;
      const p = params.value;
      const target = size.value;

      return (
        <div class="mode">
          <div class="mode-main">
            {assets.length === 0 ? (
              <ModeEmptyState title="App Store 展示图">
                <li>
                  选择目标尺寸（iPhone / iPad / Google Play / 社交卡片）。
                </li>
                <li>添加 1–3 张截图，自动排版并套上圆角与投影。</li>
                <li>填写标题与副标题，调整背景渐变与配色。</li>
                <li>导出即成可上传的商店展示图。</li>
              </ModeEmptyState>
            ) : (
              <PreviewCanvas
                width={target.w}
                height={target.h}
                draw={(ctx, scale) => {
                  const rendered = composeShowcase(
                    orderedAssets.value,
                    p,
                    scale,
                  );
                  ctx.drawImage(rendered, 0, 0);
                }}
              />
            )}
          </div>

          <aside class="mode-side">
            <AssetTray
              assets={assets}
              selectable
              selectedIndex={selected.value}
              onAdd={(files: FileList | File[] | null) =>
                void store.addFiles(files)
              }
              onRemove={store.remove}
              onMove={store.move}
              onSelect={(index: number | null) => (selected.value = index)}
              onSwap={store.swap}
            />
            <p class="muted-note">点选缩略图可把它排到最前面（主展示位）。</p>

            <Panel title="尺寸与模板">
              <Select
                value={p.sizeId}
                options={SHOWCASE_SIZES.map((s) => ({
                  value: s.id,
                  label: s.label,
                }))}
                onChange={(sizeId: string) => set({ sizeId })}
              />
              <Segmented
                value={p.template}
                options={[
                  { value: "single", label: "单机" },
                  { value: "duo", label: "双机" },
                  { value: "trio", label: "三机" },
                ]}
                onChange={(template: string) =>
                  set({ template: template as ShowcaseTemplate })
                }
              />
            </Panel>

            <Panel title="文案">
              <TextInput
                label="标题"
                value={p.title}
                placeholder="例如：让截图更好看"
                onChange={(title: string) => set({ title })}
              />
              <TextInput
                label="副标题"
                value={p.subtitle}
                placeholder="例如：一键生成展示图"
                onChange={(subtitle: string) => set({ subtitle })}
              />
              <Slider
                label="文字大小"
                min={0.5}
                max={1.6}
                step={0.02}
                value={p.titleScale}
                onChange={(titleScale: number) => set({ titleScale })}
                format={(value: number) => `${value.toFixed(2)}×`}
              />
              <ColorField
                label="文字颜色"
                value={p.textColor}
                onChange={(textColor: string) => set({ textColor })}
              />
            </Panel>

            <Panel title="背景">
              <Segmented
                size="sm"
                value={p.bgStyle}
                options={[
                  { value: "gradient", label: "渐变" },
                  { value: "solid", label: "纯色" },
                ]}
                onChange={(bgStyle: string) =>
                  set({ bgStyle: bgStyle as ShowcaseParams["bgStyle"] })
                }
              />
              <div class="swatches">
                {GRADIENTS.map((g, index) => (
                  <button
                    key={index}
                    type="button"
                    class="swatch"
                    style={{
                      background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`,
                    }}
                    onClick={() =>
                      set({
                        bgFrom: g.from,
                        bgTo: g.to,
                        bgAngle: g.angle,
                        bgStyle: "gradient",
                      })
                    }
                  />
                ))}
              </div>
              <ColorField
                label="背景起点"
                value={p.bgFrom}
                onChange={(bgFrom: string) => set({ bgFrom })}
              />
              {p.bgStyle === "gradient" ? (
                <>
                  <ColorField
                    label="背景终点"
                    value={p.bgTo}
                    onChange={(bgTo: string) => set({ bgTo })}
                  />
                  <Slider
                    label="渐变角度"
                    min={0}
                    max={360}
                    value={p.bgAngle}
                    onChange={(bgAngle: number) => set({ bgAngle })}
                    format={(value: number) => `${value}°`}
                  />
                </>
              ) : null}
            </Panel>

            <Panel title="画面">
              <Toggle
                label="投影"
                checked={p.shadow}
                onChange={(shadow: boolean) => set({ shadow })}
              />
              <Slider
                label="画面大小"
                min={0.4}
                max={1.15}
                step={0.01}
                value={p.deviceScale}
                onChange={(deviceScale: number) => set({ deviceScale })}
                format={(value: number) => `${value.toFixed(2)}×`}
              />
              <Slider
                label="圆角"
                min={0}
                max={0.14}
                step={0.002}
                value={p.radius}
                onChange={(radius: number) => set({ radius })}
                format={(value: number) => `${value.toFixed(3)}`}
              />
              <Slider
                label="间距"
                min={0.8}
                max={1.2}
                step={0.01}
                value={p.spacing}
                onChange={(spacing: number) => set({ spacing })}
                format={(value: number) => `${value.toFixed(2)}×`}
              />
            </Panel>

            {assets.length > 0 ? (
              <Panel title="导出">
                <ExportPanel
                  getCanvas={(scale: number) =>
                    composeShowcase(orderedAssets.value, p, scale)
                  }
                  width={target.w}
                  height={target.h}
                  filenameBase="myz-showcase"
                />
              </Panel>
            ) : null}
          </aside>
        </div>
      );
    };
  },
});
