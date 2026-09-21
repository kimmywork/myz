import type { MyZRecord } from "@myz/shared/types";
import { storeToRefs } from "pinia";
import { defineComponent, type PropType } from "vue";
import { useEpubReaderStore } from "../stores/reader-store.js";
import EpubHighlightsPanel from "./EpubHighlightsPanel.js";
import EpubTocPanel from "./EpubTocPanel.js";
import ReaderSidebar, {
  type ReaderSidebarTab,
} from "@/reader/ReaderSidebar.js";

/**
 * EPUB docked sidebar: TOC and annotations tabs over the shared
 * `ReaderSidebar` chrome. The shell supplies the iframe-bound focus action.
 */
export default defineComponent({
  name: "EpubSidebar",
  props: {
    activeId: { type: String as PropType<string | null>, default: null },
    onFocusRecord: {
      type: Function as PropType<(record: MyZRecord) => void>,
      required: true,
    },
  },
  setup(props) {
    const store = useEpubReaderStore();
    const { sidebarOpen, sidebarTab, highlightList } = storeToRefs(store);

    return () => {
      if (!sidebarOpen.value) {
        return null;
      }
      const tabs: ReaderSidebarTab[] = [
        { key: "toc", label: "目录" },
        {
          key: "annotations",
          label: "标注",
          count: highlightList.value.length,
        },
      ];
      return (
        <ReaderSidebar
          tabs={tabs}
          activeTab={sidebarTab.value}
          onSelectTab={(key) => {
            store.sidebarTab = key === "annotations" ? "annotations" : "toc";
          }}
          onClose={() => (store.sidebarOpen = false)}
        >
          {sidebarTab.value === "toc" ? (
            <EpubTocPanel />
          ) : (
            <EpubHighlightsPanel
              activeId={props.activeId}
              onFocus={props.onFocusRecord}
            />
          )}
        </ReaderSidebar>
      );
    };
  },
});
