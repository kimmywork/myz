import { ChatToolResponseModal as SharedChatToolResponseModal } from "@myz/dashboard-chat-ui"
import { storeToRefs } from "pinia"
import { defineComponent } from "vue"
import { useChatUIStore } from "../../stores/chatUi"

export default defineComponent({
  name: "DesktopChatToolResponseModal",
  setup() {
    const uiStore = useChatUIStore()
    const { toolResponseViewer } = storeToRefs(uiStore)

    return () => (
      <SharedChatToolResponseModal
        state={toolResponseViewer.value}
        onClose={() => uiStore.closeToolResponse()}
      />
    )
  },
})
