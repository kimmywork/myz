import { defineComponent } from "vue";
import HighlightsPane from "../components/HighlightsPane.jsx";
import PageSidebar from "../components/PageSidebar.jsx";
import { useUIStore } from "../stores/ui.js";

export default defineComponent({
  name: "HighlightsPage",
  setup() {
    const uiStore = useUIStore();
    const layoutClasses = () =>
      [
        "flex flex-col gap-6 lg:flex-row",
        uiStore.pageSidebarOpen ? "lg:items-stretch" : "",
      ].join(" ");
    return () => (
      <>
        <div class={layoutClasses()}>
          {uiStore.pageSidebarOpen ? (
            <div class="lg:w-72 lg:flex-shrink-0">
              <PageSidebar />
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
