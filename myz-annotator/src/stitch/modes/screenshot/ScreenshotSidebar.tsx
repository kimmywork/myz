import { defineComponent } from "vue";
import AssetTray from "../../components/AssetTray";
import AnalysisPanels from "./AnalysisPanels";
import CanvasExportPanel from "./CanvasExportPanel";
import StrategyPanel from "./StrategyPanel";
import SubtitlePanels from "./SubtitlePanels";
import { useScreenshotContext } from "./useScreenshotMode";

/** The screenshot editor's control column: tray + all panels. */
export default defineComponent({
  name: "ScreenshotSidebar",
  setup() {
    const mode = useScreenshotContext();
    return () => (
      <>
        <AssetTray
          assets={mode.store.assets}
          onAdd={(files: FileList | File[] | null) =>
            void mode.store.addFiles(files)
          }
          onRemove={mode.store.remove}
          onMove={mode.store.move}
        />
        <StrategyPanel />
        <SubtitlePanels />
        <AnalysisPanels />
        <CanvasExportPanel />
      </>
    );
  },
});
