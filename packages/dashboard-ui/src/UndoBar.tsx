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
    /** Inline bar for lists, fixed toast for overlays/readers. */
    variant: {
      type: String as PropType<"inline" | "toast">,
      default: "inline",
    },
    onUndo: Function as PropType<() => void>,
    onPause: Function as PropType<() => void>,
    onResume: Function as PropType<() => void>,
  },
  setup(props) {
    return () => {
      const toast = props.variant === "toast"
      return (
      <div
        class={
          toast
            ? "fixed right-4 top-4 z-[9999] flex max-w-[320px] items-center gap-3 rounded-control px-3 py-2 text-caption shadow-float"
            : "flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface-2 px-3 py-2 text-caption"
        }
        style={
          toast
            ? "background: var(--myz-overlay); color: var(--myz-overlay-text)"
            : undefined
        }
        role="status"
        aria-live="polite"
        data-testid={toast ? "undo-toast" : "undo-bar"}
      >
        <span class={["min-w-0 flex-1", toast ? "" : "text-text"].join(" ")}>
          {props.message}
        </span>
        <button
          class={
            toast
              ? "rounded-tag px-1 font-semibold underline-offset-2 hover:underline"
              : "btn h-7 rounded-control px-2 text-caption"
          }
          style={toast ? "color: var(--myz-overlay-text)" : undefined}
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
    }
  },
})
