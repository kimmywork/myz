import { defineComponent, onMounted } from "vue";
import { ConversationInfo } from "./aiStorage.js";
import { useChatStore } from "./stores/chat.js";
import { useHistoryStore } from "./stores/history.js";
import { useUIStore } from "./stores/ui.js";

export default defineComponent({
  name: "HistoryView",
  setup() {
    const historyStore = useHistoryStore();
    const chatStore = useChatStore();
    const uiStore = useUIStore();

    async function selectConversation(conv: ConversationInfo) {
      await chatStore.loadConversation(conv.id);
      uiStore.setView("chat");
    }

    async function deleteConv(convId: string) {
      if (confirm("确定要删除这个对话吗？")) {
        try {
          await historyStore.deleteConv(convId);
        } catch (e) {
          console.error("Failed to delete conversation:", e);
        }
      }
    }

    function handleBack() {
      uiStore.setView("chat");
    }

    function formatDate(dateString: string) {
      try {
        return new Date(dateString).toLocaleString();
      } catch (e) {
        return dateString;
      }
    }

    function extractHost(url: string) {
      if (!url) return "";
      try {
        return new URL(url).host;
      } catch {
        return "";
      }
    }

    onMounted(() => {
      historyStore.loadConversations();
    });

    return () => (
      <div class="flex h-full flex-col gap-4">
        <header class="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">
            对话历史
          </h2>
          <button
            class="inline-flex items-center rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-200"
            onClick={handleBack}
          >
            返回
          </button>
        </header>

        {historyStore.isLoading ? (
          <div class="flex flex-1 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
            加载中...
          </div>
        ) : historyStore.conversations.length === 0 ? (
          <div class="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
            <p class="text-base font-medium">暂无对话历史</p>
            <p class="mt-1 text-xs">与AI助理的对话将自动保存到这里</p>
          </div>
        ) : (
          <ul class="flex-1 space-y-3 overflow-y-auto pr-1">
            {historyStore.conversations.map((conv) => (
              <li
                key={conv.id}
                class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800/80"
              >
                <div
                  class="flex-1 cursor-pointer overflow-hidden"
                  onClick={() => selectConversation(conv)}
                >
                  {(() => {
                    const titleGenerated =
                      conv?.metadata?.titleGenerated === true;
                    const generatedTitle =
                      titleGenerated && typeof conv.title === "string"
                        ? conv.title.trim()
                        : "";
                    const displayTitle = generatedTitle || "未命名对话";
                    const pageTitle =
                      typeof conv?.metadata?.pageTitle === "string" &&
                      conv.metadata.pageTitle.trim()
                        ? conv.metadata.pageTitle.trim()
                        : titleGenerated
                          ? "未记录"
                          : typeof conv.title === "string" && conv.title.trim()
                            ? conv.title.trim()
                            : "未记录";
                    const host = extractHost(conv.url || "") || "未知地址";
                    return (
                      <>
                        <div class="truncate text-base font-semibold text-slate-900 dark:text-white">
                          {displayTitle}
                        </div>
                        <div class="truncate text-xs text-slate-500 dark:text-slate-400">
                          页面：{pageTitle}
                        </div>
                        <div class="mt-2 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {host}·{formatDate(conv.updatedAt)}
                        </div>
                      </>
                    );
                  })()}
                </div>
                <button
                  class="rounded-full border border-rose-200 px-3 py-1 text-xs font-medium text-rose-500 transition hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConv(conv.id);
                  }}
                  title="删除对话"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
});
