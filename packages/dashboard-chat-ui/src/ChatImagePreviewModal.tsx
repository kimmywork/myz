import { defineComponent } from "vue"
import type { PropType } from "vue"
import ChatOverlayModal from "./ChatOverlayModal"
import type { ChatImagePreviewState } from "./types"

export default defineComponent({
  name: "ChatImagePreviewModal",
  props: {
    state: {
      type: Object as PropType<ChatImagePreviewState>,
      required: true,
    },
    onClose: {
      type: Function as PropType<() => void>,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <ChatOverlayModal
        visible={props.state.visible}
        onClose={props.onClose}
        maxWidthClass="max-w-4xl"
        padded={false}
        renderHeader={() => (
          <header class="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-800">
            <div class="text-sm font-semibold text-slate-900 dark:text-white">
              {props.state.title || "图片预览"}
            </div>
            <button
              class="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 hover:text-slate-700 dark:border-slate-700 dark:text-slate-300"
              onClick={props.onClose}
            >
              ✕
            </button>
          </header>
        )}
        renderBody={() => (
          <div class="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4 dark:bg-slate-950">
            <img
              src={props.state.dataUrl}
              class="h-auto max-h-[80vh] w-auto max-w-full rounded-2xl shadow"
              alt={props.state.title || "image"}
            />
          </div>
        )}
      />
    )
  },
})
