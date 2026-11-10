import { defineComponent, h } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { WORKSPACE_NAV_ITEMS, activeNavKey } from "./workspace-nav-items.js";

/** Bottom bar below 640px (§3.6); only existing destinations are listed. */
export default defineComponent({
  name: "DashboardBottomNav",
  setup() {
    const route = useRoute();
    return () => {
      const active = activeNavKey(route.path || "");
      return (
        <nav class="flex w-full items-stretch" aria-label="主导航">
          {WORKSPACE_NAV_ITEMS.map((item) => {
            const isActive = item.key === active;
            return (
              <RouterLink
                key={item.key}
                to={item.to}
                class={[
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 text-tag",
                  isActive ? "text-accent-text" : "text-muted",
                ].join(" ")}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                data-testid={`bottom-nav-${item.key}`}
              >
                {h(item.icon, { size: 20, "aria-hidden": true })}
                <span class="truncate">{item.label}</span>
              </RouterLink>
            );
          })}
        </nav>
      );
    };
  },
});
