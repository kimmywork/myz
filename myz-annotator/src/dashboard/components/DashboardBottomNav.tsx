import { defineComponent, h } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { useUIStore } from "../stores/ui.js";
import {
  SETTINGS_NAV_ITEM,
  WORKSPACE_NAV_ITEMS,
  activeNavKey,
} from "./workspace-nav-items.js";

/**
 * Bottom bar below 640px (§3.6): the four destinations plus 设置, which
 * opens the settings modal like it does from the rail footer.
 */
export default defineComponent({
  name: "DashboardBottomNav",
  setup() {
    const route = useRoute();
    const uiStore = useUIStore();
    return () => {
      const active = activeNavKey(route.path || "");
      const itemClass = (isActive: boolean) =>
        [
          "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-tag",
          isActive ? "text-accent-text" : "text-muted",
        ].join(" ");
      return (
        <nav class="flex w-full items-stretch" aria-label="主导航">
          {WORKSPACE_NAV_ITEMS.map((item) => {
            const isActive = item.key === active;
            return (
              <RouterLink
                key={item.key}
                to={item.to}
                class={itemClass(isActive)}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                data-testid={`bottom-nav-${item.key}`}
              >
                {h(item.icon, { size: 20, "aria-hidden": true })}
                <span class="truncate">{item.label}</span>
              </RouterLink>
            );
          })}
          <button
            type="button"
            class={itemClass(false)}
            aria-label={SETTINGS_NAV_ITEM.label}
            data-testid={`bottom-nav-${SETTINGS_NAV_ITEM.key}`}
            onClick={() => uiStore.openSettings()}
          >
            {h(SETTINGS_NAV_ITEM.icon, { size: 20, "aria-hidden": true })}
            <span class="truncate">{SETTINGS_NAV_ITEM.label}</span>
          </button>
        </nav>
      );
    };
  },
});
