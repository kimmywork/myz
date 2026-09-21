import { storeToRefs } from "pinia";
import { defineComponent } from "vue";
import { useReaderStore } from "../stores/reader-store.js";
import PdfHighlightsPanel from "./PdfHighlightsPanel.js";
import PdfOutlinePanel from "./PdfOutlinePanel.js";
import ReaderSidebar, {
  type ReaderSidebarTab,
} from "@/reader/ReaderSidebar.js";

export default defineComponent({
  name: "PdfSidebar",
  setup() {
    const store = useReaderStore();
    const { status, sidebarOpen, sidebarTab, outlineCount, highlightCounts } =
      storeToRefs(store);

    return () => {
      if (!sidebarOpen.value || status.value !== "ready") {
        return null;
      }
      const tabs: ReaderSidebarTab[] = [
        { key: "outline", label: "目录", count: outlineCount.value },
        { key: "highlights", label: "划线", count: highlightCounts.value.all },
      ];
      return (
        <ReaderSidebar
          tabs={tabs}
          activeTab={sidebarTab.value}
          onSelectTab={(key) => {
            store.sidebarTab = key === "highlights" ? "highlights" : "outline";
          }}
          onClose={() => (store.sidebarOpen = false)}
        >
          {sidebarTab.value === "outline" ? (
            <PdfOutlinePanel />
          ) : (
            <PdfHighlightsPanel />
          )}
        </ReaderSidebar>
      );
    };
  },
});
