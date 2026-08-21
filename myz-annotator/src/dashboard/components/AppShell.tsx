import { DashboardAppShell } from "@myz/dashboard-ui";
import { useThemePreference } from "@myz/shared/theme";
import { defineComponent } from "vue";
import { RouterView } from "vue-router";
import DashboardNavbar from "./DashboardNavbar.jsx";
import RecordModal from "./RecordModal.jsx";

export default defineComponent({
  name: "AppShell",
  setup() {
    const { effectiveTheme } = useThemePreference();
    return () => (
      <DashboardAppShell theme={effectiveTheme.value}>
        {{
          navbar: () => <DashboardNavbar />,
          default: () => <RouterView />,
          modal: () => <RecordModal />,
        }}
      </DashboardAppShell>
    );
  },
});
