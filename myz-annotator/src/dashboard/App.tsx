import "@myz/shared/colorScheme";
import ConfirmHost from "@myz/shared/components/ConfirmHost";
import { computed, defineComponent, onBeforeUnmount, onMounted } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import SettingsModalHost from "./SettingsModalHost.jsx";
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
    const fullscreen = computed(() => Boolean(route.meta?.fullscreen));

    onMounted(async () => {
      // Route change commits pending deletes instead of dropping them.
      stopAfterEach = router.afterEach(() => deleteStore.flushOnRouteChange());
      window.addEventListener("pagehide", deleteStore.teardown);
      try {
        await Promise.all([
          highlightsStore.initialize(),
          settingsStore.initialize(),
          uiStore.initializeInboxStatus(),
        ]);
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
          <ConfirmHost />
          <RouterView />
        </div>
      ) : (
        // Every workspace page draws the four-region shell itself (§4.27);
        // settings lives in a modal over whichever page is mounted.
        <div class="app-shell h-screen overflow-hidden bg-bg text-text transition-colors">
          <ConfirmHost />
          <RouterView />
          <SettingsModalHost />
        </div>
      );
  },
});
