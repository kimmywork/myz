import { PageSidebar } from "@myz/dashboard-ui";
import { defineComponent } from "vue";
import DashboardWorkspaceLayout from "../components/DashboardWorkspaceLayout.jsx";
import type { WorkspacePageControls } from "../components/DashboardWorkspaceLayout.jsx";
import HighlightsPane from "../components/HighlightsPane.jsx";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";
import { formatDateTime } from "@/dashboard/utils/records.js";

export default defineComponent({
  name: "HighlightsPage",
  setup() {
    const uiStore = useUIStore();
    const highlightsStore = useHighlightsStore();

    return () => (
      <DashboardWorkspaceLayout>
        {{
          nav: ({ closeNav }: WorkspacePageControls) => (
            <PageSidebar
              groups={uiStore.pageGroups}
              activePageUrl={uiStore.pageFilter}
              flush
              fixedHeight
              formatDateTime={formatDateTime}
              onClear={() => {
                uiStore.clearPageFilter();
                closeNav();
              }}
              onSelect={(url) => {
                uiStore.setPageFilter(url);
                closeNav();
              }}
            />
          ),
          default: ({ openNav }: WorkspacePageControls) => (
            <div class="flex min-h-0 flex-col gap-3 p-4">
              {highlightsStore.operationStatus ? (
                <p
                  class="text-caption text-muted"
                  role="status"
                  aria-live="polite"
                >
                  {highlightsStore.operationStatus}
                </p>
              ) : null}
              <HighlightsPane onOpenNav={openNav} />
            </div>
          ),
        }}
      </DashboardWorkspaceLayout>
    );
  },
});
