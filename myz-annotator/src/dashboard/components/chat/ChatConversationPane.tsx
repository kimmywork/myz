import { computed, defineComponent } from "vue";
import ChatConversationList from "./ChatConversationList.jsx";
import ChatInputComposer from "./ChatInputComposer.jsx";
import { useChatStore } from "@/dashboard/stores/chat.js";

export default defineComponent({
  name: "DashboardChatConversationPane",
  setup() {
    const chatStore = useChatStore();

    const displayTitle = computed(() =>
      chatStore.conversationTitle?.trim()
        ? chatStore.conversationTitle
        : "未命名对话",
    );

    const updatedAtText = computed(() => {
      const updatedAt = chatStore.activeConversation?.updatedAt;
      if (!updatedAt) return "";
      try {
        return new Date(updatedAt).toLocaleString();
      } catch {
        return updatedAt;
      }
    });

    return () => (
      <section class="flex min-w-0 max-h-[calc(100vh-160px)] min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        <header class="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div class="min-w-0">
            <div class="truncate text-base font-semibold text-slate-900 dark:text-white">
              {displayTitle.value}
            </div>
            {updatedAtText.value && (
              <div class="text-xs text-slate-500 dark:text-slate-400">
                最近更新：{updatedAtText.value}
              </div>
            )}
          </div>
          {chatStore.isReadOnly && (
            <span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
              Superpower 仅可查看
            </span>
          )}
        </header>

        {!chatStore.assistantEnabled && (
          <div class="mx-5 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            智能助理未启用，请先在设置中启用并配置可用的 Provider。
          </div>
        )}

        {chatStore.isReadOnly && (
          <div class="mx-5 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            该对话来自 Superpower 模式，Dashboard 仅支持查看历史内容。
          </div>
        )}

        <div class="flex flex-1 min-h-0 flex-col overflow-hidden">
          <ChatConversationList />
          {!chatStore.isReadOnly && <ChatInputComposer />}
        </div>
      </section>
    );
  },
});
