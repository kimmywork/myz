import { WorkspaceShell } from "@myz/dashboard-ui";
import { defineComponent, ref } from "vue";
import DashboardBottomNav from "./DashboardBottomNav.jsx";
import DashboardRail from "./DashboardRail.jsx";

/** Drawer controls handed to the page's nav and main slots. */
export interface WorkspacePageControls {
  openNav: () => void;
  closeNav: () => void;
}

/**
 * Shell wiring shared by every workspace page: rail, bottom bar and the
 * narrow-screen nav drawer. Pages only supply the nav content and the main
 * area (§4.27).
 */
export default defineComponent({
  name: "DashboardWorkspaceLayout",
  setup(_, { slots }) {
    const navOpen = ref(false);
    const controls: WorkspacePageControls = {
      openNav: () => (navOpen.value = true),
      closeNav: () => (navOpen.value = false),
    };

    return () => (
      <WorkspaceShell navOpen={navOpen.value} onCloseNav={controls.closeNav}>
        {{
          rail: () => <DashboardRail />,
          nav: () => slots.nav?.(controls),
          default: () => slots.default?.(controls),
          bottomNav: () => <DashboardBottomNav />,
        }}
      </WorkspaceShell>
    );
  },
});
