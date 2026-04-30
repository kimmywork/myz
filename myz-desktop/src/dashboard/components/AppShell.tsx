import { DashboardAppShell } from "@myz/dashboard-ui";
import { defineComponent } from "vue";
import { RouterView } from "vue-router";
import { useThemePreference } from "../composables/useThemePreference";
import DashboardNavbar from "./DashboardNavbar";
import RecordModal from "./RecordModal";

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
