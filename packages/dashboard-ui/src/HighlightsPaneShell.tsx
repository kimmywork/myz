import { ChevronDown } from "@lucide/vue"
import { computed, defineComponent, onBeforeUnmount, onMounted, ref } from "vue"
import type { PropType } from "vue"

export default defineComponent({
  name: "HighlightsPaneShell",
  props: {
    summaryText: { type: String, required: true },
    pageFilter: { type: String, default: "" },
    currentPageLabel: { type: String, default: "" },
    pageSidebarOpen: { type: Boolean, default: false },
    stickyLayout: { type: Boolean, default: false },
    view: {
      type: String as PropType<"cards" | "list">,
      required: true,
    },
    pageSortMode: {
      type: String as PropType<"time" | "range">,
      default: "time",
    },
    onSetView: Function as PropType<(value: "cards" | "list") => void>,
    onSetPageSortMode: Function as PropType<(value: "time" | "range") => void>,
    onTogglePageSidebar: Function as PropType<() => void>,
    onClearPageFilter: Function as PropType<() => void>,
    onExport: Function as PropType<(format: "json" | "markdown") => void>,
  },
  setup(props, { slots }) {
    const exportMenuOpen = ref(false)
    const exportMenuRef = ref<HTMLElement | null>(null)

    const currentPageLabelShort = computed(() => {
      const label = props.currentPageLabel
      if (!label) {
        return ""
      }
      return label.length > 10 ? `${label.slice(0, 10)}…` : label
    })

    const panelClasses = computed(() => {
      const classes = [
        "rounded-panel border border-line bg-surface p-5 transition dark:border-line dark:bg-surface",
      ]
      if (props.stickyLayout) {
        classes.push("flex h-[calc(100vh-160px)] min-h-0 flex-col overflow-hidden")
      }
      return classes.join(" ")
    })

    const contentClasses = computed(() =>
      [props.stickyLayout ? "mt-4 flex-1 min-h-0 overflow-y-auto pr-1" : "mt-4"]
        .filter(Boolean)
        .join(" "),
    )

    function handleDocumentClick(event: MouseEvent) {
      if (!exportMenuOpen.value) {
        return
      }
      if (exportMenuRef.value?.contains(event.target as Node)) {
        return
      }
      exportMenuOpen.value = false
    }

    function handleExport(format: "json" | "markdown") {
      props.onExport?.(format)
      exportMenuOpen.value = false
    }

    onMounted(() => {
      document.addEventListener("click", handleDocumentClick)
    })

    onBeforeUnmount(() => {
      document.removeEventListener("click", handleDocumentClick)
    })

    return () => (
      <section class={panelClasses.value} aria-labelledby="highlights-title">
        <header class="flex flex-col gap-4 border-b border-line pb-4 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between dark:border-line">
          <div class="min-w-0 space-y-1">
            <h2 class="text-heading font-semibold text-text" id="highlights-title">
              全部记录
            </h2>
            <p class="text-compact text-muted">{props.summaryText}</p>
            {props.pageFilter ? (
              <div class="flex flex-wrap items-center gap-2 text-caption text-muted">
                <span>页面筛选：</span>
                <span
                  class="max-w-[180px] truncate rounded-full border border-line px-3 py-1 text-caption text-text dark:border-line dark:text-text"
                  title={props.currentPageLabel}
                >
                  {currentPageLabelShort.value}
                </span>
                <button
                  type="button"
                  class="text-accent-text hover:text-accent-text dark:text-accent-text"
                  onClick={() => props.onClearPageFilter?.()}
                >
                  清除
                </button>
              </div>
            ) : null}
          </div>

          <div class="flex flex-nowrap items-center gap-3 overflow-x-auto lg:overflow-visible">
            <div
              class="inline-flex rounded-full border border-line bg-surface p-1 text-caption font-semibold text-muted dark:border-line dark:bg-surface dark:text-text"
              role="group"
              aria-label="视图切换"
            >
              <button
                type="button"
                class={[
                  "h-8 rounded-full px-4 transition",
                  props.view === "cards"
                    ? "bg-accent text-on-accent "
                    : "text-muted dark:text-muted",
                ].join(" ")}
                onClick={() => props.onSetView?.("cards")}
              >
                卡片
              </button>
              <button
                type="button"
                class={[
                  "h-8 rounded-full px-4 transition",
                  props.view === "list"
                    ? "bg-accent text-on-accent "
                    : "text-muted dark:text-muted",
                ].join(" ")}
                onClick={() => props.onSetView?.("list")}
              >
                列表
              </button>
            </div>

            {props.pageFilter ? (
              <div
                class="inline-flex rounded-full border border-line bg-surface p-1 text-caption font-semibold text-muted dark:border-line dark:bg-surface dark:text-text"
                role="group"
                aria-label="排序切换"
              >
                <button
                  type="button"
                  class={[
                    "h-8 rounded-full px-4 transition",
                    props.pageSortMode === "time"
                      ? "bg-accent text-on-accent "
                      : "text-muted dark:text-muted",
                  ].join(" ")}
                  onClick={() => props.onSetPageSortMode?.("time")}
                >
                  时间
                </button>
                <button
                  type="button"
                  class={[
                    "h-8 rounded-full px-4 transition",
                    props.pageSortMode === "range"
                      ? "bg-accent text-on-accent "
                      : "text-muted dark:text-muted",
                  ].join(" ")}
                  onClick={() => props.onSetPageSortMode?.("range")}
                >
                  文中顺序
                </button>
              </div>
            ) : null}

            <button
              type="button"
              class="inline-flex h-8 items-center rounded-control border border-line px-3 text-compact font-semibold text-muted transition hover:border-accent hover:text-accent-text dark:border-line dark:text-text"
              onClick={() => props.onTogglePageSidebar?.()}
            >
              {props.pageSidebarOpen ? "收起页面" : "页面筛选"}
            </button>
            <div class="relative" ref={exportMenuRef}>
              <button
                type="button"
                class="inline-flex h-8 items-center gap-1 rounded-control border border-line px-3 text-compact font-semibold text-muted transition hover:border-accent hover:text-accent-text dark:border-line dark:text-text"
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen.value ? "true" : "false"}
                onClick={(event) => {
                  event.stopPropagation()
                  exportMenuOpen.value = !exportMenuOpen.value
                }}
              >
                导出
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              {exportMenuOpen.value ? (
                <div class="absolute right-0 z-20 mt-2 w-44 rounded-panel border border-control-border bg-surface p-1 text-compact shadow-float dark:border-control-border dark:bg-surface">
                  <button
                    type="button"
                    class="flex h-8 w-full items-center justify-between rounded-tag px-2.5 text-left text-label text-text transition hover:bg-surface-2 dark:text-text dark:hover:bg-surface-2"
                    onClick={() => handleExport("json")}
                  >
                    导出 JSON
                  </button>
                  <button
                    type="button"
                    class="flex h-8 w-full items-center justify-between rounded-tag px-2.5 text-left text-label text-text transition hover:bg-surface-2 dark:text-text dark:hover:bg-surface-2"
                    onClick={() => handleExport("markdown")}
                  >
                    导出 Markdown
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div class={contentClasses.value}>{slots.default?.()}</div>
      </section>
    )
  },
})
