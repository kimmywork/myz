import { DashboardAppShell } from "@myz/dashboard-ui";
import "@myz/shared/colorScheme";
import { useThemePreference } from "@myz/shared/theme";
import { computed, defineComponent, onBeforeUnmount, onMounted } from "vue";
import { RouterView, useRoute } from "vue-router";
import DashboardNavbar from "./components/DashboardNavbar.jsx";
import { useHighlightsStore } from "./stores/highlights.js";
import { useSettingsStore } from "./stores/settings.js";
import { useUIStore } from "./stores/ui.js";

export default defineComponent({
  name: "DashboardApp",
  setup() {
    const highlightsStore = useHighlightsStore();
    const settingsStore = useSettingsStore();
    const uiStore = useUIStore();
    const route = useRoute();
    const { effectiveTheme } = useThemePreference();
    const fullscreen = computed(() => Boolean(route.meta?.fullscreen));
    const workspace = computed(() => Boolean(route.meta?.workspace));

    onMounted(async () => {
      try {
        await Promise.all([
          highlightsStore.initialize(),
          settingsStore.initialize(),
        ]);
        // The cards/list toggle is a stored preference: honour it on load.
        uiStore.restoreView(settingsStore.settings.dashboardView);
      } catch (error) {
        console.error("Dashboard init failed", error);
      }
    });

    onBeforeUnmount(() => {
      highlightsStore.cleanup();
    });

    return () =>
      fullscreen.value ? (
        <div class="app-shell min-h-screen bg-bg text-text transition-colors">
          <RouterView />
        </div>
      ) : workspace.value ? (
        // Workspace pages draw the four-region shell themselves (§4.27).
        <div class="app-shell h-screen overflow-hidden bg-bg text-text transition-colors">
          <RouterView />
        </div>
      ) : (
        <DashboardAppShell
          theme={effectiveTheme.value}
          outerWidthClass="mx-auto flex w-full flex-col gap-6 lg:w-5/6 lg:max-w-[1400px]"
          mainClass="flex flex-col gap-6"
        >
          {{
            navbar: () => <DashboardNavbar />,
            default: () => <RouterView />,
          }}
        </DashboardAppShell>
      );
  },
});
