import { Hash } from "@lucide/vue"
import { defineComponent } from "vue"
import type { PropType } from "vue"

export default defineComponent({
  name: "HighlightTags",
  props: {
    visibleTags: {
      type: Array as PropType<string[]>,
      required: true,
    },
    hiddenTagsCount: {
      type: Number,
      required: true,
    },
    formatInline: {
      type: Function as PropType<(value: string) => string>,
      required: true,
    },
    onToggleShowAll: {
      type: Function as PropType<() => void>,
      required: false,
      default: undefined,
    },
    emptyLabel: {
      type: String,
      default: "",
    },
    class: {
      type: String,
      default: "",
    },
  },
  setup(props) {
    return () => {
      const wrapperClass = [
        "flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400",
        props.class,
      ]
        .filter(Boolean)
        .join(" ")

      if (!props.visibleTags.length && !props.emptyLabel) {
        return null
      }
      return (
        <div class={wrapperClass}>
          {props.visibleTags.length
            ? props.visibleTags.map((tag) => (
                <span
                  key={tag}
                  class="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-700 dark:border-white/10 dark:text-slate-100"
                >
                  <Hash size={12} />
                  <span innerHTML={props.formatInline(tag)} />
                </span>
              ))
            : props.emptyLabel}
          {props.hiddenTagsCount > 0 ? (
            <button
              type="button"
              class="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-700 dark:border-white/10 dark:text-slate-400 dark:hover:text-white"
              onClick={props.onToggleShowAll}
            >
              +{props.hiddenTagsCount}
            </button>
          ) : null}
        </div>
      )
    }
  },
})
