import {
  AssistantMessageBubble,
  ChatConversationListBase,
  StreamingMessage,
  ToolInlineNotice,
  ToolMessageCard,
  isToolInvocationNotice,
  resolveToolNames,
} from "@myz/dashboard-chat-ui"
import { storeToRefs } from "pinia"
import { computed, defineComponent } from "vue"
import { Message } from "@/background/ai/types.js"
import { useChatStore } from "@/dashboard/stores/chat.js"
import { useChatUIStore } from "@/dashboard/stores/chatUi.js"
import ConversationEmptyState from "./messages/ConversationEmptyState.jsx"
import UserMessageBubble from "./messages/UserMessageBubble.jsx"
import SystemEventMessageBubble from "@/sidepanel/components/messages/SystemEventMessageBubble.jsx"
import SystemMessageBubble from "@/sidepanel/components/messages/SystemMessageBubble.jsx"

export default defineComponent({
  name: "DashboardConversationList",
  setup() {
    const chatStore = useChatStore()
    const uiStore = useChatUIStore()
    const { messageListRef } = storeToRefs(uiStore)

    const messageEntries = computed(() =>
      chatStore.visibleMessages
        .filter(Boolean)
        .filter((msg) => msg.metadata?.type !== "streaming_preview"),
    )

    const hasDetails = (metadata: Message["metadata"]) =>
      Array.isArray(metadata?.toolCallDetails) &&
      metadata.toolCallDetails.length > 0

    const handleMessageClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a")
      if (!anchor) {
        return
      }
      const href = anchor.getAttribute("href") || ""
      if (!href.startsWith("myz-chunk://")) {
        return
      }
      event.preventDefault()
    }

    const renderMessage = (msg: Message) => {
      if (msg.metadata?.type === "page_context") {
        return <SystemMessageBubble key={msg.id} message={msg} />
      }
      if (msg.metadata?.type === "system_event") {
        return <SystemEventMessageBubble key={msg.id} message={msg} />
      }

      if (msg.role === "user") {
        return <UserMessageBubble key={msg.id} message={msg} />
      }

      if (isToolInvocationNotice(msg)) {
        return (
          <ToolInlineNotice
            key={msg.id}
            text={`🔧 AI正在通过以下工具检索信息: ${resolveToolNames(msg.metadata) || "处理中..."}`}
            timestamp={new Date(msg.timestamp).toLocaleTimeString()}
            onDetails={
              hasDetails(msg.metadata)
                ? () => uiStore.openToolInvocationDetails(msg)
                : undefined
            }
            showButton={hasDetails(msg.metadata)}
            size="lg"
          />
        )
      }

      if (msg.role === "tool") {
        return (
          <ToolMessageCard
            key={msg.id}
            message={msg}
            onView={(message) => {
              if (message) {
                uiStore.openToolResponse(message as Message)
              }
            }}
          />
        )
      }

      if (msg.role === "assistant") {
        return (
          <AssistantMessageBubble
            key={msg.id}
            message={msg}
            onSave={() => uiStore.openSaveModal(msg)}
            onToolDetails={(message) => {
              if (message) {
                uiStore.openToolInvocationDetails(message as Message)
              }
            }}
            isSaving={uiStore.isSavingHighlight}
          />
        )
      }

      return null
    }

    return () => (
      <ChatConversationListBase
        messages={messageEntries.value}
        setMessageListRef={(element) => {
          messageListRef.value = element
        }}
        onContainerClick={handleMessageClick}
        renderEmptyState={() => <ConversationEmptyState />}
        renderMessage={(message) => renderMessage(message as Message)}
        renderStreaming={() =>
          chatStore.hasActiveStream ? (
            <StreamingMessage
              stream={{
                id: chatStore.activeStream.id,
                content: chatStore.activeStream.content,
                timestamp: chatStore.activeStream.timestamp,
                reasoning: chatStore.activeStream.reasoning,
              }}
            />
          ) : null
        }
        isLoading={chatStore.isLoading}
        loadingText="AI 正在思考..."
      />
    )
  },
})
