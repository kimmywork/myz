import { defineComponent } from "vue";
import ExportPanel from "../../components/ExportPanel";
import { ColorField, Panel, Toggle } from "../../components/ui";
import { composeStitch } from "../../core/stitch";
import { useScreenshotContext } from "./useScreenshotMode";

/** 画布背景 + 导出. */
export default defineComponent({
  name: "ScreenshotCanvasExportPanel",
  setup() {
    const mode = useScreenshotContext();
    return () => {
      const p = mode.params.value;
      const geo = mode.geometry.value;
      const assets = mode.store.assets;
      return (
        <>
          <Panel title="画布" defaultOpen={false}>
            <Toggle
              label="透明背景"
              checked={p.background === ""}
              onChange={(transparent: boolean) =>
                mode.patchParams({ background: transparent ? "" : "#ffffff" })
              }
            />
            {p.background !== "" ? (
              <ColorField
                label="背景色"
                value={p.background}
                onChange={(background: string) =>
                  mode.patchParams({ background })
                }
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
                  p.strategy === "subtitle" ? "myz-subtitle" : "myz-stitch"
                }
                disabled={
                  !mode.canExport.value ||
                  (mode.needsAnalysis.value && !mode.analyzed.value)
                }
              />
            </Panel>
          ) : null}
        </>
      );
    };
  },
});
