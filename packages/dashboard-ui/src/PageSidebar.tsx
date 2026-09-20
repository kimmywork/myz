import { computed, defineComponent } from "vue"
import type { PropType } from "vue"

export interface PageSidebarGroup {
  url: string
  title?: string
  hostname?: string
  latestAt: string
  count: number
}

export default defineComponent({
  name: "PageSidebar",
  props: {
    groups: {
      type: Array as PropType<PageSidebarGroup[]>,
      required: true,
    },
    activePageUrl: {
      type: String as PropType<string | null>,
      default: null,
    },
    fixedHeight: {
      type: Boolean,
      default: false,
    },
    emptyLabel: {
      type: String,
      default: "暂无可用页面",
    },
    onToggle: Function as PropType<() => void>,
    onClear: Function as PropType<() => void>,
    onSelect: Function as PropType<(url: string) => void>,
    formatDateTime: {
      type: Function as PropType<(value: string) => string>,
      required: true,
    },
  },
  setup(props) {
    const sidebarClasses = computed(() => {
      const classes = [
        "w-full max-w-[264px] rounded-panel border border-line bg-surface p-4 dark:border-line dark:bg-surface",
      ]
      if (props.fixedHeight) {
        classes.push("flex h-[calc(100vh-160px)] min-h-0 flex-col overflow-hidden")
      }
      return classes.join(" ")
    })

    const groupsClasses = computed(() =>
      ["space-y-2", props.fixedHeight ? "flex-1 overflow-y-auto pr-1" : ""]
        .filter(Boolean)
        .join(" "),
    )

    return () => (
      <aside class={sidebarClasses.value}>
        <header class="flex items-center justify-between border-b border-line pb-3 dark:border-line">
          <div>
            <h3 class="text-compact font-semibold text-text">
              页面列表
            </h3>
            <p class="text-caption text-muted">按最近添加排序</p>
          </div>
          <button
            type="button"
            class="inline-flex h-8 items-center rounded-control border border-line px-3 text-caption text-muted transition hover:border-accent hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg dark:border-line dark:text-muted dark:hover:text-accent-text"
            onClick={() => props.onToggle?.()}
          >
            收起
          </button>
        </header>

        <div class="mt-3 flex min-h-0 flex-col gap-2">
          <button
            type="button"
            class={[
              "w-full rounded-control border px-3 py-2 text-left text-compact transition",
              props.activePageUrl
                ? "border-line text-muted hover:border-accent hover:text-accent-text dark:border-line dark:text-muted dark:hover:text-accent-text"
                : "border-line bg-surface-2 text-accent-text dark:border-line dark:bg-surface-2 dark:text-accent-text",
            ].join(" ")}
            onClick={() => props.onClear?.()}
          >
            全部页面
          </button>

          {props.groups.length ? (
            <div class={groupsClasses.value}>
              {props.groups.map((group) => {
                const title = group.title || group.hostname || group.url
                const isActive = props.activePageUrl === group.url
                return (
                  <button
                    key={group.url}
                    type="button"
                    class={[
                      "w-full rounded-control border px-3 py-3 text-left transition",
                      isActive
                        ? "border-line bg-surface-2 text-accent-text dark:border-line dark:bg-surface-2 dark:text-accent-text"
                        : "border-line text-muted hover:border-accent hover:text-accent-text dark:border-line dark:text-muted dark:hover:text-accent-text",
                    ].join(" ")}
                    onClick={() => props.onSelect?.(group.url)}
                  >
                    <div class="flex items-center justify-between gap-3">
                      <span class="line-clamp-2 text-compact font-semibold" title={title}>
                        {title}
                      </span>
                      <span class="rounded-full border border-line px-2 py-0.5 text-caption text-muted dark:border-line dark:text-muted">
                        {group.count}
                      </span>
                    </div>
                    <p class="mt-1 text-caption text-muted">
                      {group.hostname || group.url}
                    </p>
                    <p class="mt-1 text-caption text-muted">
                      最近添加：{props.formatDateTime(group.latestAt)}
                    </p>
                  </button>
                )
              })}
            </div>
          ) : (
            <p class="text-caption text-muted">{props.emptyLabel}</p>
          )}
        </div>
      </aside>
    )
  },
})
