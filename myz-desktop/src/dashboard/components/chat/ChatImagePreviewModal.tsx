import { ChatImagePreviewModal as SharedChatImagePreviewModal } from "@myz/dashboard-chat-ui"
import { storeToRefs } from "pinia"
import { defineComponent } from "vue"
import { useChatUIStore } from "../../stores/chatUi"

export default defineComponent({
  name: "DesktopChatImagePreviewModal",
  setup() {
    const uiStore = useChatUIStore()
    const { imagePreview } = storeToRefs(uiStore)

    return () => (
      <SharedChatImagePreviewModal
        state={imagePreview.value}
        onClose={() => uiStore.closeImagePreview()}
      />
    )
  },
})
