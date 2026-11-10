import { WorkspaceNavRail } from "@myz/dashboard-ui";
import ThemeToggle from "@myz/shared/components/ThemeToggle";
import { defineComponent } from "vue";
import { useRoute } from "vue-router";
import { WORKSPACE_NAV_ITEMS, activeNavKey } from "./workspace-nav-items.js";

/** Persistent 48px icon column shared by every workspace page (§4.27). */
export default defineComponent({
  name: "DashboardRail",
  setup() {
    const route = useRoute();
    return () => (
      <WorkspaceNavRail
        items={WORKSPACE_NAV_ITEMS}
        activeKey={activeNavKey(route.path || "")}
        renderFooter={() => (
          <ThemeToggle
            variant="switch"
            class="myz-workspace__theme"
            aria-label="切换日夜模式"
          />
        )}
      />
    );
  },
});
