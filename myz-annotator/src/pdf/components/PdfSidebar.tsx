import { X } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { defineComponent } from "vue";
import { useReaderStore } from "../stores/reader-store.js";
import PdfHighlightsPanel from "./PdfHighlightsPanel.js";
import PdfOutlinePanel from "./PdfOutlinePanel.js";

export default defineComponent({
  name: "PdfSidebar",
  setup() {
    const store = useReaderStore();
    const { status, sidebarOpen, sidebarTab, outlineCount, highlightCounts } =
      storeToRefs(store);

    return () =>
      sidebarOpen.value && status.value === "ready" ? (
        <aside class="reader-sidebar">
          <header class="reader-sidebar__head">
            <div class="reader-sidebar__tabs">
              <button
                type="button"
                class={
                  "reader-sidebar__tab" +
                  (sidebarTab.value === "outline" ? " is-active" : "")
                }
                onClick={() => (store.sidebarTab = "outline")}
              >
                目录
                {outlineCount.value ? ` (${outlineCount.value})` : ""}
              </button>
              <button
                type="button"
                class={
                  "reader-sidebar__tab" +
                  (sidebarTab.value === "highlights" ? " is-active" : "")
                }
                onClick={() => (store.sidebarTab = "highlights")}
              >
                划线
                {highlightCounts.value.all
                  ? ` (${highlightCounts.value.all})`
                  : ""}
              </button>
            </div>
            <button
              type="button"
              class="reader-sidebar__close"
              aria-label="关闭侧栏"
              onClick={() => (store.sidebarOpen = false)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div class="reader-sidebar__body">
            {sidebarTab.value === "outline" ? (
              <PdfOutlinePanel />
            ) : (
              <PdfHighlightsPanel />
            )}
          </div>
        </aside>
      ) : null;
  },
});
