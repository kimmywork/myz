import { defineComponent } from "vue"
import HighlightActions from "./HighlightActions"
import ListRow from "./ListRow"
import { highlightItemProps, useHighlightItem } from "./useHighlightItem"

function plainExcerpt(value: string | undefined, length = 400): string {
  const text = (value || "").replace(/\s+/g, " ").trim()
  return text.length > length ? `${text.slice(0, length)}…` : text
}

/**
 * One library record in the list view (§4.20): the same flush row as the
 * Inbox, with the record text on one line, source/time underneath, page and
 * hidden-tag counts on the right and icon-only actions on hover.
 */
export default defineComponent({
  name: "HighlightListRow",
  props: {
    ...highlightItemProps,
  },
  setup(props) {
    const { kind, kindIcon, sourceTitle, isClip, pageLabel } =
      useHighlightItem(props)
    const KindIcon = kindIcon

    return () => {
      const record = props.record!
      const title =
        plainExcerpt(record.text || record.note || record.title) || "（无正文）"
      const meta = [
        sourceTitle.value,
        props.formatDateTime!(record.createdAt),
        pageLabel.value,
      ]
        .filter(Boolean)
        .join(" · ")

      return (
        <ListRow
          title={title}
          meta={meta}
          tone={isClip.value ? "clip" : "tag"}
          selected={props.selected}
          onOpen={() => props.onAction?.("view", record)}
          data-id={record.id}
        >
          {{
            leading: () =>
              props.onToggleSelect ? (
                <input
                  type="checkbox"
                  class="h-4 w-4 shrink-0"
                  checked={props.selected}
                  onChange={() => props.onToggleSelect?.(record)}
                  aria-label={`选择：${title.slice(0, 40)}`}
                  data-testid="select-record"
                />
              ) : null,
            badges: () => (
              <span
                class={[
                  "inline-flex shrink-0 items-center gap-1 rounded-tag px-2 text-tag font-semibold",
                  isClip.value ? "bg-clip-bg text-clip" : "bg-tag-bg text-tag-fg",
                ].join(" ")}
              >
                <KindIcon size={12} />
              </span>
            ),
            trailing: () => (
              <>
                {pageLabel.value ? (
                  <span class="shrink-0 rounded-tag bg-warn-bg px-1.5 text-tag font-semibold text-warn">
                    {pageLabel.value}
                  </span>
                ) : null}
              </>
            ),
            actions: () => (
              <HighlightActions
                record={record}
                kind={kind.value}
                onAction={props.onAction}
                compact
              />
            ),
          }}
        </ListRow>
      )
    }
  },
})
