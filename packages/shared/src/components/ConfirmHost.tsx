import { defineComponent, onBeforeUnmount, ref } from "vue"
import { setConfirmHandler, type ConfirmRequest } from "../dialogs"
import ConfirmPopover from "./ConfirmPopover"

/**
 * Root-level themed confirmation host. Registers itself with
 * `confirmDestructive` and renders the shared popover centred on screen, so
 * every host (dashboard, content shadow root, popup, readers, stitch) shows
 * the same in-page guard instead of the browser's native dialog.
 */
export default defineComponent({
  name: "ConfirmHost",
  setup() {
    const request = ref<ConfirmRequest | null>(null)
    let resolveFn: ((value: boolean) => void) | null = null

    function settle(value: boolean) {
      resolveFn?.(value)
      resolveFn = null
      request.value = null
    }

    setConfirmHandler(
      (next) =>
        new Promise<boolean>((resolve) => {
          // Never leave an earlier caller waiting: a new request cancels it.
          resolveFn?.(false)
          resolveFn = resolve
          request.value = next
        }),
    )

    onBeforeUnmount(() => {
      setConfirmHandler(null)
      settle(false)
    })

    return () =>
      request.value ? (
        <ConfirmPopover
          style={{
            top: "30vh",
            left: "50%",
            transform: "translateX(-50%)",
          }}
          title={request.value.title ?? "确认操作"}
          message={request.value.message}
          confirmLabel={request.value.confirmLabel ?? "确定"}
          cancelLabel={request.value.cancelLabel ?? "取消"}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      ) : null
  },
})
