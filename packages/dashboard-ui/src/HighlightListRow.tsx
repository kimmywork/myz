import { computed, defineComponent } from "vue"
import HighlightActions from "./HighlightActions"
import HighlightTags from "./HighlightTags"
import {
  highlightItemProps,
  useHighlightItem,
} from "./useHighlightItem"

export default defineComponent({
  name: "HighlightListRow",
  props: {
    ...highlightItemProps,
  },
  setup(props) {
    const { kind, visibleTags, hiddenTagsCount, showAllTags, kindIcon, isClip, sourceLabel, sourceTitle, pageLabel } =
      useHighlightItem(props)
    const KindIcon = kindIcon

    const containerClasses = computed(() =>
      [
        "flex flex-col gap-3 rounded-control border border-line bg-surface/90 p-3 text-compact text-text",
        isClip.value ? "border-clip/40" : "",
      ].join(" "),
    )

    return () => (
      <div class={containerClasses.value}>
        <div class="flex flex-wrap items-center gap-3 text-caption text-muted">
          <span
            class={[
              "inline-flex items-center gap-1.5 rounded-tag px-2 py-0.5 text-tag font-semibold uppercase tracking-wide",
              isClip.value
                ? "bg-clip-bg text-clip"
                : "bg-tag-bg text-tag-fg",
            ].join(" ")}
          >
            <KindIcon size={12} />
          </span>
          <span
            class="max-w-[120px] truncate font-semibold text-muted dark:text-text"
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

        <HighlightTags
          visibleTags={visibleTags.value}
          hiddenTagsCount={hiddenTagsCount.value}
          onToggleShowAll={() => {
            showAllTags.value = !showAllTags.value
          }}
          formatInline={props.formatInline!}
        />

        <div class="flex flex-col gap-4 md:flex-row">
          <div class="min-h-0 flex-1">
            {props.record!.note ? (
              <div class="grid gap-4 md:grid-cols-2">
                <div
                  class="max-h-[20lh] overflow-y-auto rounded-control border border-line bg-bg p-3 font-read text-compact dark:border-line dark:bg-surface prose dark:prose-invert prose-sm max-w-none"
                  innerHTML={props.renderHighlight!(props.record!)}
                ></div>
                <div
                  class="max-h-[20lh] overflow-y-auto rounded-control border border-line bg-bg p-3 font-read text-compact text-muted dark:border-line dark:bg-surface prose dark:prose-invert prose-sm max-w-none"
                  innerHTML={props.formatNote!(props.record!.note)}
                ></div>
              </div>
            ) : (
              <div
                class="max-h-[20lh] overflow-y-auto rounded-control border border-line bg-bg p-3 font-read text-compact dark:border-line dark:bg-surface prose dark:prose-invert prose-sm max-w-none"
                innerHTML={props.renderHighlight!(props.record!)}
              ></div>
            )}
          </div>
        </div>

        <HighlightActions
          record={props.record!}
          kind={kind.value}
          onAction={props.onAction}
        />
      </div>
    )
  },
})
