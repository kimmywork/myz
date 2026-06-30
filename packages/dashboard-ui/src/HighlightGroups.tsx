import { type MyZRecord } from "@myz/shared"
import { defineComponent } from "vue"
import type { PropType } from "vue"
import HighlightCard from "./HighlightCard"
import HighlightListRow from "./HighlightListRow"
import type { HighlightGroupSection, HighlightItemAction } from "./highlightMeta"

export default defineComponent({
  name: "HighlightGroups",
  props: {
    loading: { type: Boolean, default: false },
    view: {
      type: String as PropType<"cards" | "list">,
      required: true,
    },
    groups: {
      type: Array as PropType<HighlightGroupSection[]>,
      required: true,
    },
    hasMore: { type: Boolean, default: false },
    setSentinelRef: Function as PropType<(value: HTMLDivElement | null) => void>,
    formatInline: {
      type: Function as PropType<(value: string) => string>,
      required: true,
    },
    formatDateTime: {
      type: Function as PropType<(value: string) => string>,
      required: true,
    },
    renderHighlight: {
      type: Function as PropType<(record: MyZRecord) => string>,
      required: true,
    },
    formatNote: {
      type: Function as PropType<(value: string) => string>,
      required: true,
    },
    onAction: Function as PropType<(action: HighlightItemAction, record: MyZRecord) => void>,
    loadingLabel: {
      type: String,
      default: "正在加载…",
    },
    emptyLabel: {
      type: String,
      default: "没有符合条件的记录。",
    },
  },
  setup(props) {
    return () => {
      if (props.loading) {
        return (
          <section class="rounded-3xl border border-slate-200 bg-white/80 p-8 text-center text-sm text-slate-500 dark:border-white/5 dark:bg-slate-900/40 dark:text-slate-400">
            {props.loadingLabel}
          </section>
        )
      }

      if (!props.groups.length) {
        return (
          <section class="rounded-3xl border border-slate-200 bg-white/80 p-8 text-center text-sm text-slate-500 dark:border-white/5 dark:bg-slate-900/40 dark:text-slate-400">
            {props.emptyLabel}
          </section>
        )
      }

      return (
        <section class="space-y-6" data-view={props.view}>
          {props.groups.map((group) => (
            <section
              key={group.date}
              class="space-y-4 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-inner dark:border-white/5 dark:bg-slate-900/40"
            >
              <h3 class="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {group.date} · 共 {group.stats.total} 条{group.detailText || ""}
              </h3>
              <div
                class={[
                  props.view === "cards"
                    ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
                    : "space-y-4",
                ].join(" ")}
              >
                {group.items.map((item) =>
                  props.view === "cards" ? (
                    <HighlightCard
                      key={item.id}
                      record={item}
                      formatInline={props.formatInline}
                      formatDateTime={props.formatDateTime}
                      renderHighlight={props.renderHighlight}
                      formatNote={props.formatNote}
                      onAction={props.onAction}
                    />
                  ) : (
                    <HighlightListRow
                      key={item.id}
                      record={item}
                      formatInline={props.formatInline}
                      formatDateTime={props.formatDateTime}
                      renderHighlight={props.renderHighlight}
                      formatNote={props.formatNote}
                      onAction={props.onAction}
                    />
                  ),
                )}
              </div>
            </section>
          ))}
          {props.hasMore ? (
            <div
              ref={(value) => props.setSentinelRef?.(value as HTMLDivElement | null)}
              class="h-8 w-full"
              data-role="sentinel"
            />
          ) : null}
        </section>
      )
    }
  },
})
