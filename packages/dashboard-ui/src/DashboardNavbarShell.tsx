import { defineComponent } from "vue"
import type { PropType, VNodeChild } from "vue"
import { RouterLink } from "vue-router"
import QuickSearch from "./QuickSearch"
import type { QuickSearchProps } from "./QuickSearch"

export type DashboardNavbarTab = {
  key: string
  label: string
  to: string
}

/**
 * Top navbar for the pages that do not use the workspace shell yet (readers,
 * settings, viewer). The search itself lives in `QuickSearch` so the workspace
 * header can reuse it.
 */
export default defineComponent({
  name: "DashboardNavbarShell",
  props: {
    title: {
      type: String,
      default: "MyZ",
    },
    tabs: {
      type: Array as PropType<DashboardNavbarTab[]>,
      required: true,
    },
    activeKey: {
      type: String,
      required: true,
    },
    isHighlightsRoute: {
      type: Boolean,
      default: false,
    },
    search: {
      type: Object as PropType<QuickSearchProps>,
      default: undefined,
    },
    tabAriaLabelByKey: {
      type: Object as PropType<Record<string, string>>,
      default: () => ({}),
    },
    renderThemeToggle: Function as PropType<() => VNodeChild>,
  },
  setup(props) {
    return () => (
      <nav class="flex flex-wrap items-center gap-4 rounded-panel border border-line bg-surface px-6 py-4 text-text dark:border-line dark:bg-surface dark:text-text">
        <div class="text-title font-semibold">{props.title}</div>
        <div class="flex flex-1 flex-wrap items-center gap-2">
          {props.tabs.map((tab) => {
            const active = props.activeKey === tab.key
            return (
              <RouterLink
                key={tab.key}
                to={tab.to}
                class={[
                  "rounded-full px-4 py-1.5 text-compact font-semibold transition",
                  active
                    ? "bg-accent text-on-accent "
                    : "text-muted hover:text-text dark:text-muted dark:hover:text-text",
                ].join(" ")}
                aria-label={props.tabAriaLabelByKey[tab.key]}
                aria-current={active ? "page" : undefined}
              >
                {tab.label}
              </RouterLink>
            )
          })}
        </div>
        {props.isHighlightsRoute && props.search ? (
          <QuickSearch {...props.search} />
        ) : null}
        <div class="ml-auto flex items-center">
          {props.renderThemeToggle?.()}
        </div>
      </nav>
    )
  },
})
