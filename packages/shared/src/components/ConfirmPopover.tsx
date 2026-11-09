import { createFocusTrap, type FocusTrap } from "../focusTrap"
import { defineComponent, onBeforeUnmount, onMounted, ref, useId } from "vue"

/**
 * Inline confirmation popup for destructive actions.
 *
 * The companion of {@link ../dialogs} for surfaces that can paint their own
 * chrome: instead of the browser's native `confirm`, hosts render this panel
 * next to the trigger. It carries `role="alertdialog"`, focuses Cancel first,
 * keeps Tab inside its two buttons, closes on Escape and hands focus back to
 * whatever was focused before it opened.
 *
 * Styling is intentionally left to the host (class names `myz-confirm*`), the
 * same split as the shared `ThemeToggle`.
 */
export default defineComponent({
  name: "ConfirmPopover",
  inheritAttrs: false,
  props: {
    title: { type: String, required: true },
    message: { type: String, required: true },
    confirmLabel: { type: String, default: "确定" },
    cancelLabel: { type: String, default: "取消" },
    /** Renders the confirm button with the destructive style. */
    danger: { type: Boolean, default: true },
  },
  emits: ["confirm", "cancel"],
  setup(props, { attrs, emit }) {
    const panelRef = ref<HTMLElement | null>(null)
    const cancelRef = ref<HTMLElement | null>(null)
    const titleId = useId()
    let trap: FocusTrap | null = null
    let closed = false

    /** Idempotent: the click-outside path and the keydown path may both fire. */
    function cancel() {
      if (closed) return
      closed = true
      emit("cancel")
    }

    /**
     * Escape is consumed here, in the capture phase, so it never reaches the
     * host page's document-level Escape handlers (the content script closes the
     * inspector from one). `stopImmediatePropagation` also silences the focus
     * trap's own keydown listener, which sits on the same document node.
     */
    function onDocumentKeydown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopImmediatePropagation()
      cancel()
    }

    /**
     * A press outside the panel dismisses it. `pointerdown` (capture) is
     * attached synchronously when the panel mounts — its own opening click has
     * already been dispatched, so it cannot dismiss itself — and preventing the
     * default keeps focus inside the panel until it unmounts and hands focus
     * back to the trigger.
     */
    function onDocumentPointerDown(event: PointerEvent) {
      const panel = panelRef.value
      if (!panel) return
      if (event.composedPath().includes(panel)) return
      // `event.target` is retargeted to the shadow host here, so look at the
      // real origin inside the open shadow root instead. The trigger re-opens
      // the popup from its own click; ignoring it avoids a close/open flicker.
      const origin = event.composedPath()[0] as Element | null
      if (origin?.closest?.("[data-myz-confirm-anchor]")) return
      event.preventDefault()
      cancel()
    }

    onMounted(() => {
      document.addEventListener("keydown", onDocumentKeydown, true)
      document.addEventListener("pointerdown", onDocumentPointerDown, true)
      if (panelRef.value) {
        trap = createFocusTrap(panelRef.value, {
          initialFocus: cancelRef.value,
          onEscape: cancel,
        })
        trap.activate()
      }
    })

    onBeforeUnmount(() => {
      document.removeEventListener("keydown", onDocumentKeydown, true)
      document.removeEventListener("pointerdown", onDocumentPointerDown, true)
      trap?.deactivate()
      trap = null
    })

    return () => {
      const { class: attrsClass, ...rest } = attrs
      return (
        <div
          {...rest}
          ref={panelRef}
          class={["myz-confirm", attrsClass]}
          role="alertdialog"
          aria-labelledby={titleId}
        >
          <h3 class="myz-confirm__title" id={titleId}>
            {props.title}
          </h3>
          <p class="myz-confirm__message">{props.message}</p>
          <div class="myz-confirm__actions">
            <button
              ref={cancelRef}
              type="button"
              class="myz-btn-secondary"
              onClick={cancel}
            >
              {props.cancelLabel}
            </button>
            <button
              type="button"
              class={props.danger ? "myz-btn-danger" : "myz-btn-primary"}
              onClick={() => emit("confirm")}
            >
              {props.confirmLabel}
            </button>
          </div>
        </div>
      )
    }
  },
})
