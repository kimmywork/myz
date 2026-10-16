import { defineComponent, provide } from "vue";
import PreviewCanvas from "../components/PreviewCanvas";
import ModeEmptyState from "./ModeEmptyState";
import ScreenshotSidebar from "./screenshot/ScreenshotSidebar";
import {
  SCREENSHOT_MODE_KEY,
  useScreenshotMode,
} from "./screenshot/useScreenshotMode";

/** 截图拼接：预览画布 + 控制侧栏（见 `screenshot/`）. */
export default defineComponent({
  name: "StitchScreenshotMode",
  setup() {
    const mode = useScreenshotMode();
    provide(SCREENSHOT_MODE_KEY, mode);
    return () => {
      const assets = mode.store.assets;
      const geo = mode.geometry.value;
      return (
        <div class="mode">
          <div class="mode-main">
            {assets.length === 0 ? (
              <ModeEmptyState title="怎么用">
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
              </ModeEmptyState>
            ) : (
              <div class="stage-wrap">
                <PreviewCanvas
                  width={geo.width}
                  height={geo.height}
                  draw={mode.drawPreview}
                  canvasRef={mode.canvasRef}
                  canvasStyle={
                    mode.params.value.strategy === "subtitle"
                      ? { touchAction: "none", cursor: "grab" }
                      : undefined
                  }
                  onPointerDown={mode.onPointerDown}
                  onPointerMove={mode.onPointerMove}
                  onPointerUp={mode.endDrag}
                  onPointerCancel={mode.endDrag}
                />
                {mode.busy.value ? (
                  <div class="stage-overlay">
                    <span class="spinner" />
                    计算中{" "}
                    {mode.progress.value
                      ? `${mode.progress.value.done}/${mode.progress.value.total}`
                      : ""}
                    …
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <aside class="mode-side">
            <ScreenshotSidebar />
          </aside>
        </div>
      );
    };
  },
});
