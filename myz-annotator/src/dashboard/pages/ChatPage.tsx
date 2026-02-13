import { defineComponent, onBeforeUnmount, onMounted } from "vue"
import ChatSidebar from "../components/chat/ChatSidebar.jsx"
import ChatConversationPane from "../components/chat/ChatConversationPane.jsx"
import ChatToolResponseModal from "../components/chat/ChatToolResponseModal.jsx"
import ChatImagePreviewModal from "../components/chat/ChatImagePreviewModal.jsx"
import ChatSaveHighlightModal from "../components/chat/ChatSaveHighlightModal.jsx"
import { useChatStore } from "../stores/chat.js"

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
      <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <ChatSidebar />
          <ChatConversationPane />
        </div>
        <ChatSaveHighlightModal />
        <ChatToolResponseModal />
        <ChatImagePreviewModal />
      </div>
    )
  },
})
