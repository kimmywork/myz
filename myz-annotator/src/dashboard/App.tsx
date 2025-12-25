import { defineComponent, onBeforeUnmount, onMounted } from "vue";
import AppShell from "./components/AppShell.jsx";
import { useHighlightsStore } from "./stores/highlights.js";
import { useSettingsStore } from "./stores/settings.js";

export default defineComponent({
  name: "DashboardApp",
  setup() {
    const highlightsStore = useHighlightsStore();
    const settingsStore = useSettingsStore();

    onMounted(async () => {
      try {
        await Promise.all([
          highlightsStore.initialize(),
          settingsStore.initialize(),
        ]);
        console.info("Dashboard initialized");
      } catch (error) {
        console.error("Dashboard init failed", error);
      }
    });

    onBeforeUnmount(() => {
      highlightsStore.cleanup();
    });

    return () => <AppShell />;
  },
});
