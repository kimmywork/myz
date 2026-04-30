import { ChatToolResponseModal as SharedChatToolResponseModal } from "@myz/dashboard-chat-ui";
import { storeToRefs } from "pinia";
import { defineComponent } from "vue";
import { useUIStore } from "../stores/ui.js";

export default defineComponent({
  name: "ToolResponseModal",
  setup() {
    const uiStore = useUIStore();
    const { toolResponseViewer } = storeToRefs(uiStore);

    return () => (
      <SharedChatToolResponseModal
        state={toolResponseViewer.value}
        onClose={() => uiStore.closeToolResponse()}
      />
    );
  },
});
