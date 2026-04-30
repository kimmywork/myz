import { ChatPageLayout } from "@myz/dashboard-chat-ui"
import { defineComponent, onBeforeUnmount, onMounted } from "vue"
import ChatConversationPane from "../components/chat/ChatConversationPane"
import ChatImagePreviewModal from "../components/chat/ChatImagePreviewModal"
import ChatSaveHighlightModal from "../components/chat/ChatSaveHighlightModal"
import ChatSidebar from "../components/chat/ChatSidebar"
import ChatToolResponseModal from "../components/chat/ChatToolResponseModal"
import { useChatStore } from "../stores/chat"

export default defineComponent({
  name: "ChatPage",
  setup() {
    const chatStore = useChatStore()

    onMounted(async () => {
      await chatStore.initialize()
    })

    onBeforeUnmount(() => {
      chatStore.cleanup()
    })

    return () => (
      <ChatPageLayout
        renderSidebar={() => <ChatSidebar />}
        renderConversation={() => <ChatConversationPane />}
        renderModals={() => (
          <>
            <ChatSaveHighlightModal />
            <ChatToolResponseModal />
            <ChatImagePreviewModal />
          </>
        )}
      />
    )
  },
})
