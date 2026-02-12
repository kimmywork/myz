import { defineComponent } from "vue"
import { useChatStore } from "@/dashboard/stores/chat.js"
import type { ConversationInfo } from "@/sidepanel/aiStorage.js"

export default defineComponent({
  name: "DashboardChatSidebar",
  setup() {
    const chatStore = useChatStore()

    async function selectConversation(conv: ConversationInfo) {
      await chatStore.loadConversation(conv.id)
    }

    async function deleteConv(convId: string) {
      if (confirm("确定要删除这个对话吗？")) {
        try {
          await chatStore.deleteConversationById(convId)
        } catch (e) {
          console.error("Failed to delete conversation:", e)
        }
      }
    }

    async function handleNewConversation() {
      if (!chatStore.assistantEnabled) return
      await chatStore.createNewConversation()
    }

    function formatDate(dateString: string) {
      try {
        return new Date(dateString).toLocaleString()
      } catch (e) {
        return dateString
      }
    }

    function extractHost(url: string) {
      if (!url) return ""
      try {
        return new URL(url).host
      } catch {
        return ""
      }
    }

    return () => (
      <aside class="flex w-full h-[calc(100vh-160px)] min-h-0 flex-col gap-4 overflow-hidden rounded-3xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 lg:w-[320px] lg:shrink-0">
        <header class="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
          <div>
            <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">
              对话历史
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">最近的对话会保留在这里</p>
          </div>
          <button
            class="inline-flex items-center rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
            onClick={handleNewConversation}
            disabled={!chatStore.assistantEnabled}
          >
            新对话
          </button>
        </header>

        {chatStore.isHistoryLoading || chatStore.conversations.length === 0 ? (
          <div class="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
            <p class="text-base font-medium">
              {chatStore.isHistoryLoading ? "正在加载对话" : "暂无对话历史"}
            </p>
            <p class="mt-1 text-xs">
              {chatStore.isHistoryLoading
                ? "稍等片刻，历史记录即将展示"
                : "与AI助理的对话将自动保存到这里"}
            </p>
          </div>
        ) : (
          <ul class="flex-1 space-y-3 overflow-y-auto pr-1">
            {chatStore.conversations.map((conv) => {
              const titleGenerated = conv?.metadata?.titleGenerated === true
              const generatedTitle =
                titleGenerated && typeof conv.title === "string" ? conv.title.trim() : ""
              const displayTitle = generatedTitle || "未命名对话"
              const pageTitle =
                typeof conv?.metadata?.pageTitle === "string" &&
                conv.metadata?.pageTitle.trim()
                  ? conv.metadata?.pageTitle.trim()
                  : titleGenerated
                    ? "未记录"
                    : typeof conv.title === "string" && conv.title.trim()
                      ? conv.title.trim()
                      : "未记录"
              const host = extractHost(conv.url || "") || "未知地址"
              const isActive = chatStore.conversationId === conv.id
              const assistantMode = conv?.metadata?.assistantMode
              return (
                <li
                  key={conv.id}
                  class={[
                    "flex items-center gap-3 rounded-2xl border px-4 py-4 shadow-sm transition",
                    isActive
                      ? "border-indigo-400 bg-indigo-50/80 dark:border-indigo-400/60 dark:bg-indigo-500/10"
                      : "border-slate-200 bg-white/90 hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800/80",
                  ].join(" ")}
                >
                  <div
                    class="flex-1 cursor-pointer overflow-hidden"
                    onClick={() => selectConversation(conv)}
                  >
                    <div class="flex items-center gap-2">
                      <div class="truncate text-base font-semibold text-slate-900 dark:text-white">
                        {displayTitle}
                      </div>
                      {assistantMode && assistantMode !== "chat" && (
                        <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          Superpower
                        </span>
                      )}
                    </div>
                    <div class="truncate text-xs text-slate-500 dark:text-slate-400">
                      页面：{pageTitle}
                    </div>
                    <div class="mt-2 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {host}·{formatDate(conv.updatedAt)}
                    </div>
                  </div>
                  <button
                    class="rounded-full border border-rose-200 px-3 py-1 text-xs font-medium text-rose-500 transition hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteConv(conv.id)
                    }}
                    title="删除对话"
                  >
                    删除
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>
    )
  },
})
