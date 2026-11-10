import { defineComponent, h } from "vue"
import type { Component, PropType, VNodeChild } from "vue"
import { RouterLink } from "vue-router"

export interface NavRailItem {
  key: string
  label: string
  to: string
  icon: Component
}

/**
 * The always-on 48px icon column (§4.27): "where am I", as opposed to the nav
 * column that says "what is in this section". Never collapses.
 */
export default defineComponent({
  name: "WorkspaceNavRail",
  props: {
    items: {
      type: Array as PropType<NavRailItem[]>,
      required: true,
    },
    activeKey: { type: String, default: null },
    renderFooter: Function as PropType<() => VNodeChild>,
  },
  setup(props) {
    return () => (
      <div class="myz-workspace__rail" role="navigation" aria-label="主导航">
        {props.items.map((item) => {
          const active = item.key === props.activeKey
          return (
            <RouterLink
              key={item.key}
              to={item.to}
              class={[
                "myz-workspace__rail-link",
                active ? "is-active" : "",
              ].join(" ")}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              title={item.label}
              data-testid={`rail-${item.key}`}
            >
              {h(item.icon, { size: 20, "aria-hidden": true })}
            </RouterLink>
          )
        })}
        <div class="myz-workspace__rail-spacer" />
        {props.renderFooter?.()}
      </div>
    )
  },
})
