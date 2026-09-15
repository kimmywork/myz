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
        "flex h-full flex-col rounded-3xl border border-slate-200 bg-white/95 p-4 text-sm text-slate-800 shadow-xl transition dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100",
      ]
      if (isClip.value) {
        classes.push("border-teal-200 dark:border-cyan-500/30")
      }
      return classes.join(" ")
    })

    return () => (
      <article class={`${cardClasses.value} break-inside-avoid`} data-id={props.record!.id} data-kind={kind.value}>
        <div class="flex items-center justify-between gap-4">
          <span
            class={[
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
              isClip.value
                ? "bg-teal-500 text-white"
                : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
            ].join(" ")}
          >
            <KindIcon size={14} />
          </span>
          <div class="flex flex-col items-end text-xs text-slate-400">
            <span
              class="max-w-[120px] truncate text-slate-500 dark:text-slate-300"
              title={sourceTitle.value}
              innerHTML={props.formatInline!(sourceLabel.value)}
            ></span>
            <span class="text-slate-400 dark:text-slate-500">
              {props.formatDateTime!(props.record!.createdAt)}
            </span>
            {pageLabel.value ? (
              <span class="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-200">
                {pageLabel.value}
              </span>
            ) : null}
          </div>
        </div>

        <div class="mt-3 flex-1 overflow-y-auto">
          {hasNote.value ? (
            <div class="grid gap-4">
              <section class="max-h-[20lh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-slate-900/70">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {getKindLabel(kind.value as RECORD_KINDS)}
                </h4>
                <div
                  class="mt-2 prose dark:prose-invert prose-sm max-w-none text-sm text-slate-800 dark:text-slate-100"
                  innerHTML={props.renderHighlight!(props.record!)}
                ></div>
              </section>
              <section class="max-h-[20lh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-slate-900/70">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  批注
                </h4>
                <div
                  class="mt-2 prose dark:prose-invert prose-sm max-w-none text-sm text-slate-600 dark:text-slate-200"
                  innerHTML={props.formatNote!(props.record!.note || "")}
                ></div>
              </section>
            </div>
          ) : (
            <section class="max-h-[20lh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-slate-900/70">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {getKindLabel(kind.value as RECORD_KINDS)}
              </h4>
              <div
                class="mt-2 prose dark:prose-invert prose-sm max-w-none text-sm text-slate-800 dark:text-slate-100"
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
