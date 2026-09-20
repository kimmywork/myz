import { PageSidebar } from "@myz/dashboard-ui";
import { defineComponent } from "vue";
import HighlightsPane from "../components/HighlightsPane.jsx";
import { useUIStore } from "../stores/ui.js";
import { formatDateTime } from "@/dashboard/utils/records.js";

export default defineComponent({
  name: "HighlightsPage",
  setup() {
    const uiStore = useUIStore();
    const layoutClasses = () =>
      [
        "flex flex-col gap-6 min-[900px]:flex-row",
        uiStore.pageSidebarOpen ? "min-[900px]:items-stretch" : "",
      ].join(" ");
    return () => (
      <>
        <div class={layoutClasses()}>
          {uiStore.pageSidebarOpen ? (
            <div class="min-[900px]:w-[264px] min-[900px]:flex-shrink-0">
              <PageSidebar
                groups={uiStore.pageGroups}
                activePageUrl={uiStore.pageFilter}
                fixedHeight={Boolean(uiStore.pageSidebarOpen)}
                formatDateTime={formatDateTime}
                onToggle={uiStore.togglePageSidebar}
                onClear={uiStore.clearPageFilter}
                onSelect={uiStore.setPageFilter}
              />
            </div>
          ) : null}
          <div class="min-w-0 flex-1">
            <HighlightsPane />
          </div>
        </div>
      </>
    );
  },
});
