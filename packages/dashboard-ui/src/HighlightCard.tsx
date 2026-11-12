import { RECORD_KINDS } from "@myz/shared"
import { computed, defineComponent } from "vue"
import HighlightActions from "./HighlightActions"
import { getKindLabel } from "./highlightMeta"
import HighlightTags from "./HighlightTags"
import {
  highlightItemProps,
  useHighlightItem,
} from "./useHighlightItem"

export default defineComponent({
  name: "HighlightCard",
  props: {
    ...highlightItemProps,
  },
  setup(props) {
    const { kind, visibleTags, hiddenTagsCount, showAllTags, kindIcon, isClip, sourceLabel, sourceTitle, pageLabel } =
      useHighlightItem(props)
    const KindIcon = kindIcon
    const hasNote = computed(() => Boolean(props.record!.note))
    /** Short, record-specific label for the selection checkbox (§a11y). */
    const recordTitle = () => {
      const record = props.record!
      const text = (record.text || record.note || record.title || "")
        .replace(/\s+/g, " ")
        .trim()
      return text.length > 40 ? `${text.slice(0, 40)}…` : text || "无正文记录"
    }

    const cardClasses = computed(() => {
      const classes = [
        "flex h-full flex-col rounded-panel border border-line bg-surface p-4 text-compact text-text transition dark:border-line dark:bg-surface",
      ]
      if (isClip.value) {
        classes.push("border-clip/40")
      }
      if (props.selected) {
        classes.push("ring-2 ring-accent")
      }
      return classes.join(" ")
    })

    return () => (
      <article class={`${cardClasses.value} break-inside-avoid`} data-id={props.record!.id} data-kind={kind.value}>
        {props.record!.attachments?.length ? (
          <div class="mb-3" data-testid="record-attachment">
            {props.attachment ? (
              <div class="relative">
                <img
                  src={props.attachment.thumb}
                  alt=""
                  class="h-40 w-full rounded-control border border-line bg-bg object-cover"
                  draggable={false}
                />
                <span class="absolute left-2 top-2 rounded-tag bg-surface px-1.5 text-tag font-semibold text-text">
                  {props.attachment.kindLabel}
                  {props.attachment.timeLabel
                    ? ` · ${props.attachment.timeLabel}`
                    : ""}
                </span>
              </div>
            ) : (
              <div class="flex h-24 items-center justify-center rounded-control border border-dashed border-line bg-bg text-caption text-muted">
                图片在本机
              </div>
            )}
          </div>
        ) : null}
        <div class="flex items-center justify-between gap-4">
          <div class="flex min-w-0 items-center gap-2">
            {props.onToggleSelect ? (
              <input
                type="checkbox"
                class="h-4 w-4 shrink-0"
                checked={props.selected}
                onChange={() => props.onToggleSelect?.(props.record!)}
                aria-label={`选择：${recordTitle()}`}
                data-testid="select-record"
              />
            ) : null}
            <span
              class={[
                "inline-flex items-center gap-1.5 rounded-tag px-2 py-1 text-tag font-semibold uppercase tracking-wide",
                isClip.value
                  ? "bg-clip-bg text-clip"
                  : "bg-tag-bg text-tag-fg",
              ].join(" ")}
            >
              <KindIcon size={14} />
            </span>
          </div>
          <div class="flex flex-col items-end text-caption text-muted">
            <span
              class="max-w-[120px] truncate text-muted"
              title={sourceTitle.value}
              innerHTML={props.formatInline!(sourceLabel.value)}
            ></span>
            <span class="text-muted dark:text-muted">
              {props.formatDateTime!(props.record!.createdAt)}
            </span>
            {pageLabel.value ? (
              <span class="rounded-full bg-warn-bg px-1.5 py-0.5 text-tag font-semibold text-warn dark:bg-warn/20 dark:text-warn">
                {pageLabel.value}
              </span>
            ) : null}
          </div>
        </div>

        <div class="mt-3 flex-1 overflow-y-auto">
          {hasNote.value ? (
            <div class="grid gap-4">
              <section class="max-h-[20lh] overflow-y-auto rounded-control border border-line bg-bg p-4 dark:border-line dark:bg-surface">
                <h4 class="text-caption font-semibold uppercase tracking-wide text-muted">
                  {getKindLabel(kind.value as RECORD_KINDS)}
                </h4>
                <div
                  class="mt-2 prose dark:prose-invert prose-sm max-w-none font-read text-compact text-text"
                  innerHTML={props.renderHighlight!(props.record!)}
                ></div>
              </section>
              <section class="max-h-[20lh] overflow-y-auto rounded-control border border-line bg-bg p-4 dark:border-line dark:bg-surface">
                <h4 class="text-caption font-semibold uppercase tracking-wide text-muted">
                  批注
                </h4>
                <div
                  class="mt-2 prose dark:prose-invert prose-sm max-w-none font-read text-compact text-muted"
                  innerHTML={props.formatNote!(props.record!.note || "")}
                ></div>
              </section>
            </div>
          ) : (
            <section class="max-h-[20lh] overflow-y-auto rounded-control border border-line bg-bg p-4 dark:border-line dark:bg-surface">
              <h4 class="text-caption font-semibold uppercase tracking-wide text-muted">
                {getKindLabel(kind.value as RECORD_KINDS)}
              </h4>
              <div
                class="mt-2 prose dark:prose-invert prose-sm max-w-none font-read text-compact text-text"
                innerHTML={props.renderHighlight!(props.record!)}
              ></div>
            </section>
          )}
        </div>

        <HighlightTags
          class="mt-4"
          visibleTags={visibleTags.value}
          hiddenTagsCount={hiddenTagsCount.value}
          onToggleShowAll={() => {
            showAllTags.value = !showAllTags.value
          }}
          formatInline={props.formatInline!}
          emptyLabel="还没有标签"
        />

        <div class="mt-4">
          <HighlightActions
            record={props.record!}
            kind={kind.value}
            onAction={props.onAction}
          />
        </div>
      </article>
    )
  },
})
