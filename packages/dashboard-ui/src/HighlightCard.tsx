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

    const cardClasses = computed(() => {
      const classes = [
        "flex h-full flex-col rounded-panel border border-line bg-surface/95 p-4 text-compact text-text shadow-float transition dark:border-line dark:bg-surface-2 dark:text-text",
      ]
      if (isClip.value) {
        classes.push("border-clip/40")
      }
      return classes.join(" ")
    })

    return () => (
      <article class={`${cardClasses.value} break-inside-avoid`} data-id={props.record!.id} data-kind={kind.value}>
        <div class="flex items-center justify-between gap-4">
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
          emptyLabel="无标签"
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
