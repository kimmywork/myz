import { ChatSidebarShell } from "@myz/dashboard-chat-ui"
import { defineComponent } from "vue"
import type { ConversationInfo } from "@myz/ai-core/types"
import { useChatStore } from "../../stores/chat"

export default defineComponent({
  name: "DesktopChatSidebar",
  setup() {
    const chatStore = useChatStore()

    async function selectConversation(conversation: ConversationInfo) {
      await chatStore.loadConversation(conversation.id)
    }

    async function deleteConversation(conversationId: string) {
      if (!window.confirm("确定要删除这个对话吗？")) {
        return
      }
      await chatStore.deleteConversationById(conversationId)
    }

    async function handleNewConversation() {
      await chatStore.createNewConversation()
    }

    function formatDate(value: string) {
      try {
        return new Date(value).toLocaleString()
      } catch {
        return value
      }
    }

    function extractHost(url: string) {
      if (!url) return "本地对话"
      try {
        return new URL(url).host
      } catch {
        return url
      }
    }

    return () => (
      <ChatSidebarShell
        description="历史记录保存在桌面应用本地数据目录"
        buttonLabel="新对话"
        onCreate={handleNewConversation}
        renderDescriptionExtra={() => (
          <p class="mt-1 line-clamp-2 text-[11px] text-slate-400 dark:text-slate-500">
            Workspace：{chatStore.workspaceSummary}
          </p>
        )}
        renderBody={() =>
          chatStore.isHistoryLoading ? (
            <div class="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
              正在加载对话…
            </div>
          ) : chatStore.conversations.length === 0 ? (
            <div class="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
              <p class="text-base font-medium">暂无对话历史</p>
              <p class="mt-1 text-xs">发送第一条消息后将自动写入桌面本地存储</p>
            </div>
          ) : (
            <ul class="flex-1 space-y-3 overflow-y-auto pr-1">
              {chatStore.conversations.map((conversation) => {
                const isActive = chatStore.conversationId === conversation.id
                return (
                  <li
                    key={conversation.id}
                    class={[
                      "flex items-center gap-3 rounded-2xl border px-4 py-4 shadow-sm transition",
                      isActive
                        ? "border-indigo-400 bg-indigo-50/80 dark:border-indigo-400/60 dark:bg-indigo-500/10"
                        : "border-slate-200 bg-white/90 hover:border-indigo-400 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800/80",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      class="min-w-0 flex-1 cursor-pointer overflow-hidden text-left"
                      onClick={() => selectConversation(conversation)}
                    >
                      <div class="truncate text-base font-semibold text-slate-900 dark:text-white">
                        {conversation.title?.trim() || "未命名对话"}
                      </div>
                      <div class="truncate text-xs text-slate-500 dark:text-slate-400">
                        {extractHost(conversation.url || "")}
                      </div>
                      <div class="mt-2 text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        {formatDate(conversation.updatedAt)}
                      </div>
                    </button>
                    <button
                      class="rounded-full border border-rose-200 px-3 py-1 text-xs font-medium text-rose-500 transition hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10"
                      onClick={() => deleteConversation(conversation.id)}
                      title="删除对话"
                    >
                      删除
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        }
      />
    )
  },
})
