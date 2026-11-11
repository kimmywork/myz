import { DashboardAppShell } from "@myz/dashboard-ui";
import "@myz/shared/colorScheme";
import { useThemePreference } from "@myz/shared/theme";
import { computed, defineComponent, onBeforeUnmount, onMounted } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import DashboardNavbar from "./components/DashboardNavbar.jsx";
import { useDeleteStore } from "./stores/delete.js";
import { useHighlightsStore } from "./stores/highlights.js";
import { useSettingsStore } from "./stores/settings.js";
import { useUIStore } from "./stores/ui.js";

export default defineComponent({
  name: "DashboardApp",
  setup() {
    const highlightsStore = useHighlightsStore();
    const settingsStore = useSettingsStore();
    const uiStore = useUIStore();
    const deleteStore = useDeleteStore();
    const router = useRouter();
    let stopAfterEach: (() => void) | null = null;
    const route = useRoute();
    const { effectiveTheme } = useThemePreference();
    const fullscreen = computed(() => Boolean(route.meta?.fullscreen));
    const workspace = computed(() => Boolean(route.meta?.workspace));

    onMounted(async () => {
      // Route change commits pending deletes instead of dropping them.
      stopAfterEach = router.afterEach(() => deleteStore.flush());
      window.addEventListener("pagehide", deleteStore.teardown);
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
      stopAfterEach?.();
      window.removeEventListener("pagehide", deleteStore.teardown);
      deleteStore.teardown();
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
