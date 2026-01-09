import { defineComponent, ref } from "vue";
import { useChatStore } from "../stores/chat.js";
import { useUIStore } from "../stores/ui.js";

export default defineComponent({
  name: "InputComposer",
  setup() {
    const chatStore = useChatStore();
    const uiStore = useUIStore();
    const fileInputRef = ref<HTMLInputElement | null>(null);

    const handleInput = (event: Event) => {
      const target = event.target as HTMLInputElement;
      chatStore.userInput = target.value;
    };

    const handlePickImages = () => {
      fileInputRef.value?.click();
    };

    const handleFilesChanged = async (event: Event) => {
      const target = event.target as HTMLInputElement;
      await chatStore.addImageFiles(target.files);
      target.value = "";
    };

    const handleKeydown = async (e: KeyboardEvent) => {
      if (uiStore.isComposing) {
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        await chatStore.sendMessage(chatStore.userInput);
      }
    };

    const handleSend = async () => {
      await chatStore.sendMessage(chatStore.userInput);
    };

    return () => (
      <div class="border-t border-slate-200/80 bg-white/80 px-4 py-3 dark:border-slate-800/80 dark:bg-slate-900/80">
        {chatStore.attachments.length > 0 && (
          <div class="mb-3 flex flex-wrap gap-2">
            {chatStore.attachments.map((item, index) => (
              <div class="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                <img
                  src={item.dataUrl}
                  class="h-full w-full object-cover"
                  alt={item.name || `image-${index + 1}`}
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
                    chatStore.removeAttachment(index);
                  }}
                  title="移除图片"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          class="min-h-[120px] w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          value={chatStore.userInput}
          placeholder="请输入您的消息..."
          rows={3}
          disabled={chatStore.isLoading}
          onInput={handleInput}
          onKeydown={handleKeydown}
          onCompositionstart={() => uiStore.setComposing(true)}
          onCompositionend={() => uiStore.setComposing(false)}
        />
        <div class="mt-3 flex items-center justify-between text-xs text-slate-500">
          <div class="flex items-center gap-2">
            {chatStore.canAttachImages && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  class="hidden"
                  onChange={handleFilesChanged}
                />
                <button
                  class="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  onClick={handlePickImages}
                  disabled={chatStore.isLoading}
                >
                  添加图片
                </button>
              </>
            )}
            {chatStore.error && <span class="text-rose-500">{chatStore.error}</span>}
          </div>
          <button
            class="inline-flex items-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
            onClick={handleSend}
            disabled={
              (!chatStore.userInput?.trim() &&
                chatStore.attachments.length === 0 &&
                !(
                  chatStore.draftContext.present &&
                  chatStore.draftContext.enabled &&
                  ((chatStore.draftContext.text || "").trim() ||
                    chatStore.draftContext.attachments.length > 0)
                )) ||
              chatStore.isLoading
            }
          >
            发送
          </button>
        </div>
      </div>
    );
  },
});
