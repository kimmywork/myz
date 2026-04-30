import { DashboardAppShell } from "@myz/dashboard-ui";
import { defineComponent } from "vue";
import { RouterView } from "vue-router";
import DashboardNavbar from "./DashboardNavbar.jsx";
import RecordModal from "./RecordModal.jsx";
import { useThemePreference } from "@/shared/theme.js";

export default defineComponent({
  name: "AppShell",
  setup() {
    const { theme } = useThemePreference();
    return () => (
      <DashboardAppShell theme={theme.value}>
        {{
          navbar: () => <DashboardNavbar />,
          default: () => <RouterView />,
          modal: () => <RecordModal />,
        }}
      </DashboardAppShell>
    );
  },
});
