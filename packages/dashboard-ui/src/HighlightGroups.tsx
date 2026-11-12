import { type MyZRecord } from "@myz/shared"
import { defineComponent } from "vue"
import type { PropType } from "vue"
import HighlightCard from "./HighlightCard"
import HighlightListRow from "./HighlightListRow"
import type { HighlightGroupSection, HighlightItemAction } from "./highlightMeta"
import type { RecordAttachmentView } from "./useHighlightItem"
import StatePanel from "./StatePanel"

/**
 * Record list by date (§4.20). Cards stay as they are (default view); the list
 * view is the same flush row layout as the Inbox: one outer frame per date,
 * rows separated by 1px, no card per record.
 */
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
    onAction: Function as PropType<
      (action: HighlightItemAction, record: MyZRecord, event?: MouseEvent) => void
    >,
    /** Batch selection (§4.31); omitted when the host has no selection. */
    selectedIds: Object as PropType<ReadonlySet<string>>,
    onToggleSelect: Function as PropType<(record: MyZRecord) => void>,
    /** Attachment thumbnails by asset id (§I7); absent = show the placeholder. */
    attachmentViews: Object as PropType<ReadonlyMap<string, RecordAttachmentView>>,
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

      const sentinel = props.hasMore ? (
        <div
          ref={(value) => props.setSentinelRef?.(value as HTMLDivElement | null)}
          class="h-8 w-full"
          data-role="sentinel"
        />
      ) : null

      const sharedPropsFor = (item: MyZRecord) => ({
        record: item,
        formatInline: props.formatInline,
        formatDateTime: props.formatDateTime,
        renderHighlight: props.renderHighlight,
        formatNote: props.formatNote,
        onAction: props.onAction,
        selected: props.selectedIds?.has(item.id) ?? false,
        onToggleSelect: props.onToggleSelect,
        attachment: item.attachments?.[0]?.assetId
          ? props.attachmentViews?.get(item.attachments[0].assetId)
          : undefined,
      })

      if (props.view === "list") {
        return (
          <section class="highlight-groups space-y-4" data-view="list">
            {props.groups.map((group) => (
              <section key={group.date}>
                <h3 class="mb-2 px-1 text-tag font-semibold uppercase tracking-wide text-muted">
                  {group.date} · 共 {group.stats.total} 条{group.detailText || ""}
                </h3>
                <div
                  class="overflow-hidden rounded-panel border border-line bg-surface"
                  role="list"
                  aria-label={`${group.date} 的记录`}
                >
                  {group.items.map((item) => (
                    <HighlightListRow
                      key={item.id}
                      {...sharedPropsFor(item)}
                    />
                  ))}
                </div>
              </section>
            ))}
            {sentinel}
          </section>
        )
      }

      return (
        <section class="highlight-groups space-y-6" data-view="cards">
          {props.groups.map((group) => (
            <section
              key={group.date}
              class="space-y-3 rounded-panel border border-line bg-surface p-4 dark:border-line dark:bg-surface"
            >
              <h3 class="text-tag font-semibold uppercase tracking-wide text-muted">
                {group.date} · 共 {group.stats.total} 条{group.detailText || ""}
              </h3>
              <div class="space-y-3 columns-1 gap-3 sm:columns-2 xl:columns-3">
                {group.items.map((item) => (
                  <HighlightCard key={item.id} {...sharedPropsFor(item)} />
                ))}
              </div>
            </section>
          ))}
          {sentinel}
        </section>
      )
    }
  },
})
