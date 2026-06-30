import { ChatToolResponseModal as SharedChatToolResponseModal } from "@myz/dashboard-chat-ui";
import { storeToRefs } from "pinia";
import { defineComponent } from "vue";
import { useChatUIStore } from "@/dashboard/stores/chatUi.js";

export default defineComponent({
  name: "DashboardToolResponseModal",
  setup() {
    const uiStore = useChatUIStore();
    const { toolResponseViewer } = storeToRefs(uiStore);

    return () => (
      <SharedChatToolResponseModal
        state={toolResponseViewer.value}
        onClose={() => uiStore.closeToolResponse()}
      />
    );
  },
});
