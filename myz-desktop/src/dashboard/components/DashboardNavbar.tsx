import {
  DashboardNavbarShell,
  type DashboardNavbarTab,
} from "@myz/dashboard-ui"
import { computed, defineComponent } from "vue"
import { useRoute } from "vue-router"
import { useHighlightsStore } from "../stores/highlights"
import { useUIStore } from "../stores/ui"
import ThemeToggle from "./ThemeToggle"

export default defineComponent({
  name: "DashboardNavbar",
  setup() {
    const route = useRoute()
    const highlightsStore = useHighlightsStore()
    const uiStore = useUIStore()
    const tabs: Array<
      DashboardNavbarTab & { isActive: (path: string) => boolean }
    > = [
      {
        key: "highlights",
        label: "标注列表",
        to: "/highlights",
        isActive: (path: string) => path.startsWith("/highlights"),
      },
      {
        key: "chat",
        label: "聊天",
        to: "/chat",
        isActive: (path: string) => path.startsWith("/chat"),
      },
      {
        key: "settings",
        label: "设置",
        to: "/settings",
        isActive: (path: string) => path.startsWith("/settings"),
      },
    ]

    const activeKey = computed(() => {
      const path = route.path || ""
      return tabs.find((tab) => tab.isActive(path))?.key ?? "highlights"
    })

    const isHighlightsRoute = computed(() => (route.path || "") === "/highlights")

    return () => (
      <DashboardNavbarShell
        tabs={tabs.map(({ key, label, to }) => ({ key, label, to }))}
        activeKey={activeKey.value}
        isHighlightsRoute={isHighlightsRoute.value}
        quickSearch={uiStore.quickSearch}
        availableTags={highlightsStore.availableTags}
        availableSites={highlightsStore.availableSites}
        onApplyQuickSearch={uiStore.applyQuickSearch}
        onResetFilters={uiStore.resetFilters}
        renderThemeToggle={() => (
          <ThemeToggle variant="switch" aria-label="切换日夜模式" />
        )}
      />
    )
  },
})
