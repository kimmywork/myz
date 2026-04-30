import { ChatConversationShell } from "@myz/dashboard-chat-ui"
import { computed, defineComponent } from "vue"
import ChatConversationList from "./ChatConversationList"
import ChatInputComposer from "./ChatInputComposer"
import { useChatStore } from "../../stores/chat"

export default defineComponent({
  name: "DesktopChatConversationPane",
  setup() {
    const chatStore = useChatStore()

    const updatedAtText = computed(() => {
      const updatedAt = chatStore.activeConversation?.updatedAt
      if (!updatedAt) return ""
      try {
        return new Date(updatedAt).toLocaleString()
      } catch {
        return updatedAt
      }
    })

    return () => (
      <ChatConversationShell
        renderHeader={() => (
          <header class="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div class="min-w-0">
              <div class="truncate text-base font-semibold text-slate-900 dark:text-white">
                {chatStore.conversationTitle}
              </div>
              {updatedAtText.value ? (
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  最近更新：{updatedAtText.value}
                </div>
              ) : (
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  本地聊天记录会保存到 Tauri app data
                </div>
              )}
              <div class="text-xs text-slate-500 dark:text-slate-400">
                当前模型：{chatStore.conversationTargetSummary}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400">
                {chatStore.conversationConnectionSummary}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400">
                当前角色：{chatStore.personaSummary}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400">
                Workspace：{chatStore.workspaceSummary}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400">
                {chatStore.workspacePolicySummary}
              </div>
            </div>
          </header>
        )}
        renderNotices={() => (
          <>
            {!chatStore.assistantEnabled ? (
              <div class="mx-5 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                智能助理未启用，请先在设置中开启并配置可用 Provider。
              </div>
            ) : null}

            {chatStore.assistantTargetError ? (
              <div class="mx-5 mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                聊天模型未就绪：{chatStore.assistantTargetError}
              </div>
            ) : null}
          </>
        )}
        renderList={() => <ChatConversationList />}
        renderComposer={() => <ChatInputComposer />}
      />
    )
  },
})
