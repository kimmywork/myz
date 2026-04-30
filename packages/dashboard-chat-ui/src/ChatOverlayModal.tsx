import { defineComponent } from "vue"
import type { PropType } from "vue"

export default defineComponent({
  name: "ChatOverlayModal",
  props: {
    visible: { type: Boolean, required: true },
    maxWidthClass: { type: String, default: "max-w-2xl" },
    padded: { type: Boolean, default: true },
    onClose: {
      type: Function as PropType<() => void>,
      required: true,
    },
    renderHeader: {
      type: Function as PropType<() => unknown>,
      required: true,
    },
    renderBody: {
      type: Function as PropType<() => unknown>,
      required: true,
    },
    renderFooter: {
      type: Function as PropType<() => unknown>,
      default: null,
    },
  },
  setup(props) {
    return () =>
      props.visible ? (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur"
          onClick={() => props.onClose()}
        >
          <div
            class={[
              "flex w-full max-h-[90vh] flex-col rounded-3xl bg-white shadow-2xl dark:bg-slate-900",
              props.maxWidthClass,
              props.padded ? "p-6" : "overflow-hidden",
            ].join(" ")}
            onClick={(event) => event.stopPropagation()}
          >
            {props.renderHeader()}
            {props.renderBody()}
            {props.renderFooter?.()}
          </div>
        </div>
      ) : null
  },
})
