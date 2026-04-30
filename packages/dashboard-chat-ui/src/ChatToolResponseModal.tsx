import { defineComponent } from "vue"
import type { PropType } from "vue"
import ChatOverlayModal from "./ChatOverlayModal"
import type { ChatToolResponseViewerState } from "./types"

export default defineComponent({
  name: "ChatToolResponseModal",
  props: {
    state: {
      type: Object as PropType<ChatToolResponseViewerState>,
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
        maxWidthClass="max-w-2xl"
        renderHeader={() => (
          <header class="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <div>
              <div class="text-lg font-semibold text-slate-900 dark:text-white">
                🔧 {props.state.toolName}
              </div>
              {props.state.timestamp ? (
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  {new Date(props.state.timestamp).toLocaleString()}
                </div>
              ) : null}
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
          <div class="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
            {props.state.invocationDetails.length > 0 ? (
              props.state.invocationDetails.map((detail) => (
                <div
                  key={detail.id}
                  class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <div class="text-sm font-semibold">{detail.name}</div>
                  <pre class="mt-2 whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">
                    {detail.arguments}
                  </pre>
                </div>
              ))
            ) : (
              <>
                {props.state.args ? (
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <div class="text-sm font-semibold">调用参数</div>
                    <pre class="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">
                      {props.state.args}
                    </pre>
                  </div>
                ) : null}
                <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <div class="text-sm font-semibold">工具输出</div>
                  <pre class="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-slate-500 dark:text-slate-400">
                    {props.state.content || "（无内容）"}
                  </pre>
                </div>
              </>
            )}
          </div>
        )}
      />
    )
  },
})
