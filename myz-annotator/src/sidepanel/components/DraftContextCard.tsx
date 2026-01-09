import { defineComponent } from "vue";
import { storeToRefs } from "pinia";
import { useChatStore } from "../stores/chat.js";
import { useUIStore } from "../stores/ui.js";

export default defineComponent({
  name: "DraftContextCard",
  setup() {
    const chatStore = useChatStore();
    const uiStore = useUIStore();
    const { draftContext, isLoading } = storeToRefs(chatStore);

    return () =>
      draftContext.value.present ? (
        <section class="mt-4 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-slate-900 dark:text-white">
                选中内容上下文
              </div>
              <div class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                发送时会附带这段选中内容（可关闭或清空）
              </div>
            </div>
            <button
              class="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:text-slate-700 dark:border-slate-700 dark:text-slate-300"
              onClick={() => chatStore.clearDraftContext()}
              disabled={isLoading.value}
              title="清空"
            >
              清空
            </button>
          </div>

          <label class="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <div>
              <p class="font-semibold text-slate-800 dark:text-slate-50">
                发送选中内容
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                作为本次对话的上下文
              </p>
            </div>
            <input
              type="checkbox"
              class="h-5 w-5 rounded border-slate-300 text-indigo-500 focus:ring-indigo-500 dark:border-slate-600"
              checked={draftContext.value.enabled}
              disabled={isLoading.value}
              onChange={(e) => {
                const target = e.target as HTMLInputElement;
                draftContext.value.enabled = target.checked;
              }}
            />
          </label>

          {draftContext.value.text && (
            <div class="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <div class="max-h-28 overflow-auto whitespace-pre-wrap">
                {draftContext.value.text}
              </div>
            </div>
          )}

          {draftContext.value.attachments.length > 0 && (
            <div class="mt-3 flex flex-wrap gap-2">
              {draftContext.value.attachments.map((item, index) => (
                <div class="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                  <img
                    src={item.dataUrl}
                    class="h-full w-full object-cover"
                    alt={item.name || `context-image-${index + 1}`}
                    onClick={() =>
                      uiStore.openImagePreview({
                        dataUrl: item.dataUrl,
                        title: item.name || "图片预览",
                      })
                    }
                  />
                  <button
                    class="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/70 text-xs text-white hover:bg-slate-900"
                    onClick={(e) => {
                      e.stopPropagation();
                      chatStore.removeDraftAttachment(index);
                    }}
                    title="移除图片"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null;
  },
});
