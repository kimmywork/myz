import {
  IconClip,
  IconCrop,
  IconHighlightPaint,
  IconSearch,
} from "@myz/shared/icons";
import { defineComponent } from "vue";
import { useToolbarStore } from "@/content/stores/toolbar-store.js";

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
        <button type="button" aria-label="划线" onClick={handleAnnotate}>
          <IconHighlightPaint size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label="摘录" onClick={handleClip}>
          <IconClip size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label="截取" onClick={handleCapture}>
          <IconCrop size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label="搜索" onClick={handleSearch}>
          <IconSearch size={16} aria-hidden="true" />
        </button>
      </div>
    );
  },
});
