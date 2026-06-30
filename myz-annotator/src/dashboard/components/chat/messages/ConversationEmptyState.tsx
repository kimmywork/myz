import { ConversationEmptyState as SharedConversationEmptyState } from "@myz/dashboard-chat-ui";
import { defineComponent } from "vue";

export default defineComponent({
  name: "DashboardConversationEmptyState",
  setup() {
    return () => (
      <SharedConversationEmptyState
        title="💬 开始与AI对话"
        description="输入您的问题开始新的对话"
      />
    );
  },
});
