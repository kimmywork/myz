import { defineComponent, onBeforeUnmount, onMounted } from "vue";
import { RouterView } from "vue-router";
import { useHighlightsStore } from "./dashboard/stores/highlights";
import { useSettingsStore } from "./dashboard/stores/settings";
import { useUIStore } from "./dashboard/stores/ui";
import { useThemePreference } from "./dashboard/composables/useThemePreference";

export default defineComponent({
  name: "App",
  setup() {
    const highlightsStore = useHighlightsStore();
    const settingsStore = useSettingsStore();
    const uiStore = useUIStore();
    const { initialize: initializeTheme } = useThemePreference();

    onMounted(async () => {
      try {
        await Promise.all([
          initializeTheme(),
          settingsStore.initialize(),
          uiStore.initialize(),
          highlightsStore.initialize(),
        ]);
      } catch (error) {
        console.error("Desktop dashboard init failed", error);
      }
    });

    onBeforeUnmount(() => {
      highlightsStore.cleanup();
      settingsStore.cleanup();
    });

    return () => (
      <div id="app">
        <RouterView />
      </div>
    );
  },
});
