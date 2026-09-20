import {
  DashboardNavbarShell,
  type DashboardNavbarTab,
} from "@myz/dashboard-ui";
import ThemeToggle from "@myz/shared/components/ThemeToggle";
import { computed, defineComponent } from "vue";
import { useRoute } from "vue-router";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";

export default defineComponent({
  name: "DashboardNavbar",
  setup() {
    const route = useRoute();
    const highlightsStore = useHighlightsStore();
    const uiStore = useUIStore();
    const tabs: Array<
      DashboardNavbarTab & { isActive: (path: string) => boolean }
    > = [
      {
        key: "highlights",
        label: "文库",
        to: "/highlights",
        isActive: (path: string) => path.startsWith("/highlights"),
      },
      {
        key: "readers",
        label: "阅读",
        to: "/readers",
        isActive: (path: string) => path.startsWith("/readers"),
      },
      {
        key: "settings",
        label: "设置",
        to: "/settings",
        isActive: (path: string) => path.startsWith("/settings"),
      },
    ];

    const activeKey = computed(() => {
      const path = route.path || "";
      return tabs.find((tab) => tab.isActive(path))?.key ?? "highlights";
    });

    const isHighlightsRoute = computed(
      () => (route.path || "") === "/highlights",
    );

    return () => (
      <DashboardNavbarShell
        tabs={tabs.map(({ key, label, to }) => ({ key, label, to }))}
        activeKey={activeKey.value}
        isHighlightsRoute={isHighlightsRoute.value}
        quickSearch={uiStore.quickSearch}
        availableTags={highlightsStore.availableTags}
        availableSites={highlightsStore.availableSites}
        tabAriaLabelByKey={{ settings: "打开设置" }}
        onApplyQuickSearch={uiStore.applyQuickSearch}
        onResetFilters={uiStore.resetFilters}
        renderThemeToggle={() => (
          <ThemeToggle variant="switch" aria-label="切换日夜模式" />
        )}
      />
    );
  },
});
