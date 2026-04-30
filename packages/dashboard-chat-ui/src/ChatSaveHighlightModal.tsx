import { defineComponent } from "vue"
import type { PropType } from "vue"
import ChatOverlayModal from "./ChatOverlayModal"
import type { ChatSaveHighlightModalState } from "./types"

export default defineComponent({
  name: "ChatSaveHighlightModal",
  props: {
    state: {
      type: Object as PropType<ChatSaveHighlightModalState>,
      required: true,
    },
    note: { type: String, required: true },
    tags: { type: Array as PropType<string[]>, required: true },
    saving: { type: Boolean, default: false },
    onClose: {
      type: Function as PropType<() => void>,
      required: true,
    },
    onSave: {
      type: Function as PropType<() => void>,
      required: true,
    },
    onNoteChange: {
      type: Function as PropType<(value: string) => void>,
      required: true,
    },
    renderTagsInput: {
      type: Function as PropType<() => unknown>,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <ChatOverlayModal
        visible={props.state.visible}
        onClose={props.onClose}
        maxWidthClass="max-w-lg"
        renderHeader={() => (
          <header class="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
              保存 AI 摘录
            </h3>
            <button
              class="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 hover:text-slate-700 dark:border-slate-700 dark:text-slate-300"
              onClick={props.onClose}
            >
              ✕
            </button>
          </header>
        )}
        renderBody={() => (
          <div class="mt-4 space-y-4">
            <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                AI 回复内容
              </h4>
              <div class="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap">
                {props.state.aiResponse}
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-700 dark:text-slate-200">
                添加备注（可选）
              </label>
              <textarea
                class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                value={props.note}
                rows={4}
                placeholder="添加您的备注…"
                onInput={(event) =>
                  props.onNoteChange((event.target as HTMLTextAreaElement).value)
                }
              />
            </div>

            <div class="space-y-2">
              <label class="text-sm font-medium text-slate-700 dark:text-slate-200">
                标签
              </label>
              {props.renderTagsInput()}
            </div>
          </div>
        )}
        renderFooter={() => (
          <footer class="mt-6 flex items-center justify-end gap-3">
            <button
              class="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-200"
              onClick={props.onClose}
            >
              取消
            </button>
            <button
              class="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
              onClick={props.onSave}
              disabled={props.saving}
            >
              {props.saving ? "保存中…" : "保存摘录"}
            </button>
          </footer>
        )}
      />
    )
  },
})
