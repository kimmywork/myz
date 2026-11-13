import {
  defineComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue"
import type { PropType, VNodeChild } from "vue"
import {
  createFocusTrap,
  isUsableFocusTarget,
  type FocusTrap,
} from "@myz/shared/focusTrap"
import { IconClose } from "@myz/shared/icons"

/**
 * §4.8 landing order for the initial focus. Each step must be **visible and
 * usable**, otherwise the focus silently stays outside the layer.
 *
 * 1. the first usable input — a dialog that asks for something focuses the ask;
 * 2. the title-bar close button;
 * 3. the footer's cancel action — any footer button that is neither marked
 *    `data-dialog-primary` nor styled as primary/danger, because the initial
 *    focus must never be able to submit on Enter;
 * 4. the dialog container itself, which is why it carries `tabindex="-1"`.
 */
/**
 * Landing spot for the initial focus (§4.8). "Usable" is the shared check the
 * focus trap uses too, so both agree on what can take focus.
 */
export function resolveInitialFocus(layer: HTMLElement): HTMLElement {
  const usable = isUsableFocusTarget

  const fields = Array.from(
    layer.querySelectorAll<HTMLElement>(
      "input:not([type=hidden]), textarea, select",
    ),
  )
  for (const element of fields) {
    if (usable(element)) return element
  }

  const close = layer.querySelector<HTMLElement>("[data-dialog-close]")
  if (close && usable(close)) return close

  const footer = layer.querySelector<HTMLElement>("[data-dialog-footer]")
  if (footer) {
    for (const element of Array.from(
      footer.querySelectorAll<HTMLElement>("button"),
    )) {
      if (!usable(element)) continue
      // The attribute is the contract; the variant classes stay as the safety
      // net so an unmarked primary cannot be picked by accident.
      if (element.hasAttribute("data-dialog-primary")) continue
      if (
        element.classList.contains("btn-primary") ||
        element.classList.contains("btn-danger")
      ) {
        continue
      }
      return element
    }
  }

  return layer
}

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
 * The landing spot is resolved here and passed to the trap rather than left to
 * "the first focusable in the DOM": with a hidden X and a footer, that rule
 * would land on the footer's submit button and let Enter decide for the user.
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
        initialFocus: resolveInitialFocus(layerRef.value),
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
            class="flex max-h-full flex-col overflow-hidden rounded-panel border border-line bg-surface text-text shadow-float focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            style={`width: min(${props.width}px, 100%)`}
            role="dialog"
            aria-modal="true"
            aria-label={props.ariaLabel || props.title || undefined}
            tabindex="-1"
          >
            {props.title || !props.hideCloseButton ? (
              <header class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <h2 class="min-w-0 truncate text-label font-semibold text-text">
                  {props.title}
                </h2>
                {props.hideCloseButton ? null : (
                  <button
                    type="button"
                    class="rounded-control p-1 text-muted hover:text-text"
                    data-dialog-close
                    aria-label="关闭"
                    onClick={() => props.onClose?.()}
                  >
                    <IconClose size={16} aria-hidden="true" />
                  </button>
                )}
              </header>
            ) : null}
            <div class="min-h-0 flex-1 overflow-y-auto p-4">
              {slots.default?.()}
            </div>
            {slots.footer ? (
              <footer
                data-dialog-footer
                class="flex items-center justify-end gap-2 border-t border-line px-4 py-3"
              >
                {slots.footer()}
              </footer>
            ) : null}
          </div>
        </div>
      )
    }
  },
})
