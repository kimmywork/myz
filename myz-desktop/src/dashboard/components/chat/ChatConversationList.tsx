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
import type { Message } from "@myz/ai-core/types"
import { useChatStore } from "../../stores/chat"
import { useChatUIStore } from "../../stores/chatUi"
import ConversationEmptyState from "./messages/ConversationEmptyState"
import SystemEventMessageBubble from "./messages/SystemEventMessageBubble"
import UserMessageBubble from "./messages/UserMessageBubble"

export default defineComponent({
  name: "DesktopChatConversationList",
  setup() {
    const chatStore = useChatStore()
    const uiStore = useChatUIStore()
    const { messageListRef } = storeToRefs(uiStore)

    const messageEntries = computed(() =>
      chatStore.visibleMessages.filter(
        (message) => message.metadata?.type !== "streaming_preview",
      ),
    )

    const hasDetails = (metadata: Message["metadata"]) =>
      Array.isArray(metadata?.toolCallDetails) && metadata.toolCallDetails.length > 0

    const renderMessage = (message: Message) => {
      if (message.metadata?.type === "system_event") {
        return <SystemEventMessageBubble key={message.id} message={message} />
      }

      if (message.role === "user") {
        return <UserMessageBubble key={message.id} message={message} />
      }

      if (isToolInvocationNotice(message)) {
        return (
          <ToolInlineNotice
            key={message.id}
            text={`🔧 AI 正在调用工具：${resolveToolNames(message.metadata) || "处理中..."}`}
            showButton={hasDetails(message.metadata)}
            onDetails={
              hasDetails(message.metadata)
                ? () => uiStore.openToolInvocationDetails(message)
                : undefined
            }
            size="lg"
          />
        )
      }

      if (message.role === "tool") {
        return (
          <ToolMessageCard
            key={message.id}
            message={message}
            onView={(targetMessage) => {
              if (targetMessage) {
                uiStore.openToolResponse(targetMessage as Message)
              }
            }}
          />
        )
      }

      return (
        <AssistantMessageBubble
          key={message.id}
          message={message}
          onSave={() => uiStore.openSaveModal(message)}
          onToolDetails={(targetMessage) => {
            if (targetMessage) {
              uiStore.openToolInvocationDetails(targetMessage as Message)
            }
          }}
          isSaving={uiStore.isSavingHighlight}
        />
      )
    }

    return () => (
      <ChatConversationListBase
        messages={messageEntries.value}
        setMessageListRef={(element) => {
          messageListRef.value = element
        }}
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
        loadingText="AI 正在思考…"
      />
    )
  },
})
