import { defineComponent } from "vue";
import { useChatStore } from "../stores/chat.js";
import { useUIStore } from "../stores/ui.js";

export default defineComponent({
  name: "InputComposer",
  setup() {
    const chatStore = useChatStore();
    const uiStore = useUIStore();

    const handleInput = (event: Event) => {
      const target = event.target as HTMLInputElement;
      chatStore.userInput = target.value;
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
          {chatStore.error && <span class="text-rose-500">{chatStore.error}</span>}
          <button
            class="inline-flex items-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
            onClick={handleSend}
            disabled={!chatStore.userInput?.trim() || chatStore.isLoading}
          >
            发送
          </button>
        </div>
      </div>
    );
  },
});
