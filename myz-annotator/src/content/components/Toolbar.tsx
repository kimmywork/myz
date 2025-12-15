import { defineComponent } from "vue";
import { IconPencil, IconNotebook, IconCamera } from "../../shared/icons.js";
import { useToolbarStore } from "../stores/toolbar-store.js";

export default defineComponent({
  name: "MyZToolbar",
  setup(props) {
    const store = useToolbarStore();

    const handleAnnotate = (event: Event) => {
      event.preventDefault();
      store.handleAnnotateClick();
    };

    const handleClip = (event: Event) => {
      event.preventDefault();
      store.handleClipClick();
    };

    const handleCapture = (event: Event) => {
      event.preventDefault();
      store.handleScreenshotClick();
    };

    return () => (
      <div
        class={
          "myz-annotator-toolbar" + `${store.isVisible() ? "" : " myz-hidden"}`
        }
        style={{
          top: `${store.toolbarPosition?.top ?? "0px"}`,
          left: `${store.toolbarPosition?.left ?? "0px"}`,
        }}
      >
        <button type="button" aria-label="添加标注" onClick={handleAnnotate}>
          <IconPencil size={18} aria-hidden="true" />
        </button>
        <button type="button" aria-label="保存文字" onClick={handleClip}>
          <IconNotebook size={18} aria-hidden="true" />
        </button>
        <button type="button" aria-label="截取选区截图" onClick={handleCapture}>
          <IconCamera size={18} aria-hidden="true" />
        </button>
      </div>
    );
  },
});
