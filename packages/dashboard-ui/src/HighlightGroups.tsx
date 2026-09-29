import { type MyZRecord } from "@myz/shared"
import { defineComponent } from "vue"
import type { PropType } from "vue"
import HighlightCard from "./HighlightCard"
import HighlightListRow from "./HighlightListRow"
import StatePanel from "./StatePanel"
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
      default: "这里还没有记录",
    },
  },
  setup(props) {
    return () => {
      if (props.loading) {
        return (
          <StatePanel
            kind="loading"
            title={props.loadingLabel}
            class="dark:border-line dark:bg-surface dark:text-muted"
          />
        )
      }

      if (!props.groups.length) {
        return (
          <StatePanel
            kind="empty"
            title={props.emptyLabel}
            hint="在网页上选中文字就能划线"
            class="dark:border-line dark:bg-surface"
          />
        )
      }

      return (
        <section
          class="highlight-groups space-y-6"
          data-view={props.view}
        >
          {props.groups.map((group) => (
            <section
              key={group.date}
              class="space-y-3 rounded-panel border border-line bg-surface p-4 dark:border-line dark:bg-surface"
            >
              <h3 class="text-tag font-semibold uppercase tracking-wide text-muted">
                {group.date} · 共 {group.stats.total} 条{group.detailText || ""}
              </h3>
              <div
                class={[
                  props.view === "cards"
                    ? "space-y-3 columns-1 gap-3 sm:columns-2 xl:columns-3"
                    : "space-y-3",
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
