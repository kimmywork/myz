import { ConversationEmptyState as SharedConversationEmptyState } from "@myz/dashboard-chat-ui"
import { defineComponent } from "vue"

export default defineComponent({
  name: "ConversationEmptyState",
  setup() {
    return () => (
      <SharedConversationEmptyState
        title="💬 开始与AI对话"
        description="输入您的问题，或选择页面文本进行提问"
      />
    )
  },
})
