import { computed, defineComponent } from "vue"
import {
  highlightItemProps,
  useHighlightItem,
} from "./useHighlightItem"
import HighlightActions from "./HighlightActions"
import HighlightTags from "./HighlightTags"

export default defineComponent({
  name: "HighlightListRow",
  props: {
    ...highlightItemProps,
  },
  setup(props) {
    const { kind, visibleTags, hiddenTagsCount, showAllTags, kindIcon, isClip, sourceLabel, sourceTitle } =
      useHighlightItem(props)
    const KindIcon = kindIcon

    const containerClasses = computed(() =>
      [
        "flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3 text-sm text-slate-800 shadow-sm dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100",
        isClip.value ? "border-teal-200 dark:border-cyan-500/30" : "",
      ].join(" "),
    )

    return () => (
      <div class={containerClasses.value}>
        <div class="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span
            class={[
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              isClip.value
                ? "bg-teal-500 text-white"
                : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
            ].join(" ")}
          >
            <KindIcon size={12} />
          </span>
          <span
            class="max-w-[120px] truncate font-semibold text-slate-600 dark:text-slate-200"
            title={sourceTitle.value}
            innerHTML={props.formatInline!(sourceLabel.value)}
          ></span>
          <span class="text-slate-400 dark:text-slate-500">
            {props.formatDateTime!(props.record!.createdAt)}
          </span>
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
                  class="max-h-[20lh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap dark:border-white/5 dark:bg-slate-900/70 prose dark:prose-invert prose-sm max-w-none"
                  innerHTML={props.renderHighlight!(props.record!)}
                ></div>
                <div
                  class="max-h-[20lh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 whitespace-pre-wrap dark:border-white/5 dark:bg-slate-900/70 dark:text-slate-200 prose dark:prose-invert prose-sm max-w-none"
                  innerHTML={props.formatNote!(props.record!.note)}
                ></div>
              </div>
            ) : (
              <div
                class="max-h-[20lh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap dark:border-white/5 dark:bg-slate-900/70 prose dark:prose-invert prose-sm max-w-none"
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
