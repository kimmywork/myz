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
        "flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted",
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
                  class="inline-flex h-[22px] items-center gap-1 rounded-tag bg-tag-bg px-2 text-tag font-semibold text-tag-fg"
                >
                  <Hash size={12} />
                  <span innerHTML={props.formatInline(tag)} />
                </span>
              ))
            : props.emptyLabel}
          {props.hiddenTagsCount > 0 ? (
            <button
              type="button"
              class="relative inline-flex h-[22px] items-center rounded-tag border border-line px-2 text-tag font-semibold text-muted transition hover:text-text before:absolute before:-inset-1.5 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
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
