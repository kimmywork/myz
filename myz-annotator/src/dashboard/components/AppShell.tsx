import { computed, defineComponent } from "vue";
import { useDashboardStore } from "../store/useDashboardStore.js";
import { useThemePreference } from "../../shared/theme.js";
import DashboardNavbar from "./DashboardNavbar.jsx";
import FilterToolbar from "./FilterToolbar.jsx";
import HighlightsPane from "./HighlightsPane.jsx";
import SettingsPane from "./SettingsPane.jsx";
import RecordModal from "./RecordModal.jsx";

export default defineComponent({
  name: "AppShell",
  setup() {
    const store = useDashboardStore();
    const { theme } = useThemePreference();
    const shellClasses = computed(() => [
      "app-shell min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100",
      theme.value === "dark" ? "dark" : "",
    ]);
    return () => (
      <div class={shellClasses.value.join(" ")}>
        <div class="mx-auto w-full px-4 py-8 sm:px-6 lg:px-10">
          <div class="mx-auto flex w-full flex-col gap-6 lg:w-5/6 lg:max-w-[1400px]">
            <DashboardNavbar />
            {store.panel.value === "highlights" ? <FilterToolbar /> : null}
            <main class="flex flex-col gap-6">
              <HighlightsPane active={store.panel.value === "highlights"} />
              <SettingsPane active={store.panel.value === "settings"} />
            </main>
          </div>
        </div>
        <RecordModal />
      </div>
    );
  },
});
