import { defineComponent } from "vue"
import type { PropType } from "vue"

/**
 * Inline undo bar for page-level deletes (§4.30): one status line with a
 * single text action, never covering the list. Hovering or focusing the
 * action pauses the commit countdown.
 */
export default defineComponent({
  name: "UndoBar",
  props: {
    message: { type: String, required: true },
    onUndo: Function as PropType<() => void>,
    onPause: Function as PropType<() => void>,
    onResume: Function as PropType<() => void>,
  },
  setup(props) {
    return () => (
      <div
        class="flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-2 text-caption"
        role="status"
        aria-live="polite"
      >
        <span class="min-w-0 flex-1 text-text">{props.message}</span>
        <button
          class="btn h-7 rounded-control px-2 text-caption"
          type="button"
          onClick={() => props.onUndo?.()}
          onMouseenter={() => props.onPause?.()}
          onMouseleave={() => props.onResume?.()}
          onFocus={() => props.onPause?.()}
          onBlur={() => props.onResume?.()}
        >
          撤销
        </button>
      </div>
    )
  },
})
