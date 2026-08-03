import { defineComponent } from "vue";
import { useToolbarStore } from "@/content/stores/toolbar-store.js";
import {
  IconCamera,
  IconNotebook,
  IconPencil,
  IconSearch,
} from "@/shared/icons.js";

export default defineComponent({
  name: "MyZToolbar",
  setup() {
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

    const handleSearch = (event: Event) => {
      event.preventDefault();
      store.handleSearchClick();
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
        <button type="button" aria-label="搜索选中内容" onClick={handleSearch}>
          <IconSearch size={18} aria-hidden="true" />
        </button>
      </div>
    );
  },
});
