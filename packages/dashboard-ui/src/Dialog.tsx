import {
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue"
import type { PropType, VNodeChild } from "vue"
import { createFocusTrap, type FocusTrap } from "@myz/shared/focusTrap"

/**
 * Modal dialog (§4.15 / §4.18).
 *
 * Focus behaviour is **not** re-implemented here: it uses the shared
 * `createFocusTrap`, which is the same primitive the content overlay and the
 * reader already use. That is the whole point of extracting this component —
 * one trap, not a second copy that drifts.
 *
 * What it guarantees, per the contract:
 * - focus moves into the layer when it opens;
 * - Tab / Shift+Tab cycle inside it;
 * - Escape closes it;
 * - focus returns to whatever was focused before.
 *
 * It is presentational: the caller owns `open` and does the closing. Content and
 * footer come through slots so this stays layout, not a page.
 */
export default defineComponent({
  name: "Dialog",
  props: {
    open: { type: Boolean, default: false },
    /** Accessible name; rendered as the heading when `title` is set. */
    ariaLabel: { type: String, default: "" },
    title: { type: String, default: "" },
    /** Close on Escape, the backdrop, or the corner button. */
    onClose: Function as PropType<() => void>,
    /** Hide the corner close button (the footer owns the actions). */
    hideCloseButton: { type: Boolean, default: false },
    /** §4.18 widths in px: 280 note, 320 capture editor, 360 popup. */
    width: { type: Number, default: 360 },
  },
  setup(props, { slots }) {
    const layerRef = ref<HTMLElement | null>(null)
    let trap: FocusTrap | null = null

    function activate() {
      if (!layerRef.value) return
      trap?.deactivate()
      trap = createFocusTrap(layerRef.value, {
        onEscape: () => props.onClose?.(),
      })
      trap.activate()
    }

    function deactivate() {
      trap?.deactivate()
      trap = null
    }

    watch(
      () => props.open,
      async (open) => {
        if (open) {
          // Wait for the layer to be in the DOM: trapping before that finds no
          // container and silently does nothing (which is how Escape stopped
          // working the first time this was written).
          await nextTick()
          activate()
        } else {
          deactivate()
        }
      },
    )

    onMounted(async () => {
      if (!props.open) return
      await nextTick()
      activate()
    })

    onBeforeUnmount(deactivate)

    return (): VNodeChild => {
      if (!props.open) return null
      return (
        <div
          class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-6"
          data-testid="dialog-backdrop"
          onClick={(event: MouseEvent) => {
            if (event.target === event.currentTarget) props.onClose?.()
          }}
        >
          <div
            ref={layerRef}
            class="flex max-h-full flex-col overflow-hidden rounded-panel border border-line bg-surface text-text shadow-float"
            style={`width: min(${props.width}px, 100%)`}
            role="dialog"
            aria-modal="true"
            aria-label={props.ariaLabel || props.title || undefined}
          >
            {props.title || !props.hideCloseButton ? (
              <header class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <h2 class="min-w-0 truncate text-label font-semibold text-text">
                  {props.title}
                </h2>
                {props.hideCloseButton ? null : (
                  <button
                    type="button"
                    class="rounded-control px-2 py-1 text-caption text-muted hover:text-text"
                    aria-label="关闭"
                    onClick={() => props.onClose?.()}
                  >
                    关闭
                  </button>
                )}
              </header>
            ) : null}
            <div class="min-h-0 flex-1 overflow-y-auto p-4">
              {slots.default?.()}
            </div>
            {slots.footer ? (
              <footer class="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
                {slots.footer()}
              </footer>
            ) : null}
          </div>
        </div>
      )
    }
  },
})
