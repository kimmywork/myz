import { ConversationEmptyState as SharedConversationEmptyState } from "@myz/dashboard-chat-ui"
import { defineComponent } from "vue"
import { useChatStore } from "../../../stores/chat"

export default defineComponent({
  name: "DesktopConversationEmptyState",
  setup() {
    const chatStore = useChatStore()

    return () => (
      <SharedConversationEmptyState
        title="💬 开始与 AI 对话"
        description="消息和附件会保存在桌面本地会话仓库中"
        renderExtra={() => (
          <>
            <p class="mt-2 text-xs">当前模型：{chatStore.conversationTargetSummary}</p>
            <p class="mt-1 text-xs">{chatStore.conversationConnectionSummary}</p>
          </>
        )}
      />
    )
  },
})
