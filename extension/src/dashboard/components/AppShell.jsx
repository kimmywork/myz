import { defineComponent } from "vue";
import { useDashboardStore } from "../store/useDashboardStore.js";
import DashboardSidebar from "./DashboardSidebar.jsx";
import HighlightsPane from "./HighlightsPane.jsx";
import SettingsPane from "./SettingsPane.jsx";
import RecordModal from "./RecordModal.jsx";

export default defineComponent({
  name: "AppShell",
  setup() {
    const store = useDashboardStore();
    return () => (
      <div class="app-shell">
        <DashboardSidebar />
        <main class="main">
          <HighlightsPane active={store.panel.value === "highlights"} />
          <SettingsPane active={store.panel.value === "settings"} />
        </main>
        <RecordModal />
      </div>
    );
  }
});
