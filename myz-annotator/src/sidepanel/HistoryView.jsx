import { defineComponent, ref, onMounted } from "vue";
import {
  listConversations,
  getMessagesForConversation,
  deleteConversation,
} from "./aiStorage.js";

export default defineComponent({
  name: "HistoryView",
  props: {
    onSelectConversation: {
      type: Function,
      required: true,
    },
    onBack: {
      type: Function,
      required: true,
    },
  },
  setup(props) {
    const conversations = ref([]);
    const isLoading = ref(true);

    async function loadConversations() {
      isLoading.value = true;
      try {
        // Get all conversations
        const allConversations = await listConversations(100);

        // Filter to only show conversations with AI responses (assistant messages)
        const filtered = [];
        for (const conv of allConversations) {
          try {
            const messages = await getMessagesForConversation(conv.id, 1000);
            // Check if there's at least one assistant message
            const hasAIResponse = messages.some((m) => m.role === "assistant");
            if (hasAIResponse) {
              filtered.push(conv);
            }
          } catch (e) {
            console.warn("Failed to check conversation:", conv.id, e);
          }
        }
        conversations.value = filtered;
      } catch (e) {
        console.error("Failed to load conversations:", e);
      } finally {
        isLoading.value = false;
      }
    }

    async function selectConversation(conv) {
      try {
        const messages = await getMessagesForConversation(conv.id, 1000);
        props.onSelectConversation({
          conversationId: conv.id,
          title: conv.title,
          url: conv.url,
          messages,
          sendContextEnabled:
            typeof conv.sendContextEnabled === "boolean"
              ? conv.sendContextEnabled
              : messages.some((m) => m.metadata?.type === "page_context"),
        });
      } catch (e) {
        console.error("Failed to load conversation:", e);
      }
    }

    async function deleteConv(convId) {
      if (confirm("确定要删除这个对话吗？")) {
        try {
          await deleteConversation(convId);
          await loadConversations();
        } catch (e) {
          console.error("Failed to delete conversation:", e);
        }
      }
    }

    function formatDate(dateString) {
      try {
        return new Date(dateString).toLocaleString();
      } catch (e) {
        return dateString;
      }
    }

    function truncate(text, length = 100) {
      if (!text) return "";
      return text.length > length ? text.slice(0, length) + "..." : text;
    }

    onMounted(() => {
      loadConversations();
    });

    return () => (
      <div class="flex h-full flex-col gap-4">
        <header class="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
          <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">
            对话历史
          </h2>
          <button
            class="inline-flex items-center rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-200"
            onClick={props.onBack}
          >
            返回
          </button>
        </header>

        {isLoading.value ? (
          <div class="flex flex-1 items-center justify-center text-sm text-slate-500 dark:text-slate-400">
            加载中...
          </div>
        ) : conversations.value.length === 0 ? (
          <div class="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
            <p class="text-base font-medium">暂无对话历史</p>
            <p class="mt-1 text-xs">与AI助理的对话将自动保存到这里</p>
          </div>
        ) : (
          <ul class="flex-1 space-y-3 overflow-y-auto pr-1">
            {conversations.value.map((conv) => (
              <li
                key={conv.id}
                class="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800/80"
              >
                <div
                  class="flex-1 cursor-pointer overflow-hidden"
                  onClick={() => selectConversation(conv)}
                >
                  <div class="truncate text-base font-semibold text-slate-900 dark:text-white">
                    {conv.title || "未命名对话"}
                  </div>
                  <div class="truncate text-xs text-slate-500 dark:text-slate-400">
                    {truncate(conv.url)}
                  </div>
                  <div class="mt-2 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {formatDate(conv.updatedAt)}
                  </div>
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
