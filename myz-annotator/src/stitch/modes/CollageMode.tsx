import { defineComponent, provide } from "vue";
import PreviewCanvas from "../components/PreviewCanvas";
import CollageSidebar from "./collage/CollageSidebar";
import { COLLAGE_MODE_KEY, useCollageMode } from "./collage/useCollageMode";
import ModeEmptyState from "./ModeEmptyState";

/** 拼图：预览画布 + 控制侧栏（见 `collage/`）. */
export default defineComponent({
  name: "StitchCollageMode",
  setup() {
    const mode = useCollageMode();
    provide(COLLAGE_MODE_KEY, mode);
    return () => {
      const assets = mode.store.assets;
      const geom = mode.geom.value;
      return (
        <div class="mode">
          <div class="mode-main">
            {assets.length === 0 ? (
              <ModeEmptyState title="拼图布局">
                <li>添加 1–16 张图片，自动套用网格布局。</li>
                <li>点选某个格子后拖动可平移画面，用滑块缩放。</li>
                <li>在下方缩略图里点选两张可交换顺序。</li>
                <li>调整边距、圆角、间距与背景后导出。</li>
              </ModeEmptyState>
            ) : (
              <PreviewCanvas
                width={geom.W}
                height={geom.H}
                draw={mode.drawPreview}
                canvasRef={mode.canvasRef}
                canvasStyle={{ touchAction: "none" }}
                onPointerDown={mode.onPointerDown}
                onPointerMove={mode.onPointerMove}
                onPointerUp={mode.endDrag}
                onPointerCancel={mode.endDrag}
                onDoubleClick={mode.onDoubleClick}
              />
            )}
          </div>

          <aside class="mode-side">
            <CollageSidebar />
          </aside>
        </div>
      );
    };
  },
});
