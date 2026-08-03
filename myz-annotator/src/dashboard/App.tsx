import { DashboardAppShell } from "@myz/dashboard-ui";
import { defineComponent, onBeforeUnmount, onMounted } from "vue";
import { RouterView } from "vue-router";
import DashboardNavbar from "./components/DashboardNavbar.jsx";
import RecordModal from "./components/RecordModal.jsx";
import { useHighlightsStore } from "./stores/highlights.js";
import { useSettingsStore } from "./stores/settings.js";
import { useThemePreference } from "@/shared/theme.js";

export default defineComponent({
  name: "DashboardApp",
  setup() {
    const highlightsStore = useHighlightsStore();
    const settingsStore = useSettingsStore();
    const { effectiveTheme } = useThemePreference();

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

    return () => (
      <DashboardAppShell
        theme={effectiveTheme.value}
        outerWidthClass="mx-auto flex w-full flex-col gap-6 lg:w-5/6 lg:max-w-[1400px]"
        mainClass="flex flex-col gap-6"
      >
        {{
          navbar: () => <DashboardNavbar />,
          default: () => <RouterView />,
          modal: () => <RecordModal />,
        }}
      </DashboardAppShell>
    );
  },
});
