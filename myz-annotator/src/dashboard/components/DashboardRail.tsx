import { Settings } from "@lucide/vue";
import { WorkspaceNavRail } from "@myz/dashboard-ui";
import ThemeToggle from "@myz/shared/components/ThemeToggle";
import { defineComponent } from "vue";
import { useRoute } from "vue-router";
import { useUIStore } from "../stores/ui.js";
import { WORKSPACE_NAV_ITEMS, activeNavKey } from "./workspace-nav-items.js";

/**
 * Persistent 48px icon column shared by every workspace page (§4.27).
 * Footer order is fixed: theme toggle first, then the settings button —
 * 设置 opens a modal instead of being a destination.
 */
export default defineComponent({
  name: "DashboardRail",
  setup() {
    const route = useRoute();
    const uiStore = useUIStore();
    return () => (
      <WorkspaceNavRail
        items={WORKSPACE_NAV_ITEMS}
        activeKey={activeNavKey(route.path || "")}
        renderFooter={() => (
          <>
            <ThemeToggle
              variant="switch"
              class="myz-workspace__theme"
              aria-label="切换日夜模式"
            />
            <button
              type="button"
              class="myz-workspace__rail-btn"
              aria-label="设置"
              title="设置"
              data-testid="rail-settings"
              onClick={() => uiStore.openSettings()}
            >
              <Settings size={20} aria-hidden="true" />
            </button>
          </>
        )}
      />
    );
  },
});
