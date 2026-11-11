import { defineComponent } from "vue"
import type { PropType } from "vue"

/**
 * Toast undo for overlay/reader surfaces (§4.30): fixed top-right, one text
 * action, 6s window owned by the caller. Hovering or focusing the action
 * pauses the commit countdown.
 */
export default defineComponent({
  name: "UndoToast",
  props: {
    message: { type: String, required: true },
    onUndo: Function as PropType<() => void>,
    onPause: Function as PropType<() => void>,
    onResume: Function as PropType<() => void>,
  },
  setup(props) {
    return () => (
      <div
        class="fixed right-4 top-4 z-[9999] flex max-w-[320px] items-center gap-3 rounded-control px-3 py-2 text-caption shadow-float"
        style="background: var(--myz-overlay); color: var(--myz-overlay-text)"
        role="status"
        aria-live="polite"
        data-testid="undo-toast"
      >
        <span class="min-w-0 flex-1">{props.message}</span>
        <button
          class="rounded-tag px-1 font-semibold underline-offset-2 hover:underline"
          type="button"
          style="color: var(--myz-overlay-text)"
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
