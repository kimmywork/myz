import { computed, defineComponent } from "vue";
import { storeToRefs } from "pinia";
import AssistantMessageBubble from "./messages/AssistantMessageBubble.jsx";
import ConversationEmptyState from "./messages/ConversationEmptyState.jsx";
import { resolveToolNames } from "./messages/messageUtils.jsx";
import StreamingMessage from "./messages/StreamingMessage.jsx";
import SystemMessageBubble from "./messages/SystemMessageBubble.jsx";
import ToolInlineNotice from "./messages/ToolInlineNotice.jsx";
import ToolMessageCard from "./messages/ToolMessageCard.jsx";
import UserMessageBubble from "./messages/UserMessageBubble.jsx";
import { Message } from "@/background/ai/types.js";
import { useChatStore } from "../stores/chat.js";
import { useUIStore } from "../stores/ui.js";
import { usePageStore } from "../stores/page.js";

function isToolInvocationNotice(msg: Message): boolean {
  if (!msg || msg.role !== "assistant" || !msg.metadata?.hasToolCalls) {
    return false;
  }
  const reasoningText = (
    (msg as any)?.reasoning_content ||
    (msg.metadata as any)?.reasoning ||
    (msg.metadata as any)?.reasoning_content ||
    ""
  ).trim();
  if (reasoningText) {
    return false;
  }

  const text = (msg.content || "").trim();
  if (!text) {
    return true;
  }
  const pattern = /\[Tool\s+\d+:[^\]]+\]/g;
  const matches = text.match(pattern);
  if (!matches) return false;
  const remaining = text.replace(pattern, "").trim();
  if (remaining.length > 0) {
    return false;
  }

  // Some messages are explicitly marked tool-invocation-only; keep the old behavior,
  // but only when there is no other user-visible output.
  if (msg.metadata?.toolInvocationOnly) {
    return true;
  }
  return true;
}

export default defineComponent({
  name: "ConversationList",
  setup() {
    const chatStore = useChatStore();
    const uiStore = useUIStore();
    const pageStore = usePageStore();
    const { messageListRef } = storeToRefs(uiStore);

    const messageEntries = computed(() =>
      chatStore.visibleMessages
        .filter(Boolean)
        .filter((msg) => msg.metadata?.type !== "streaming_preview"),
    );

    const hasDetails = (metadata: Message["metadata"]) =>
      Array.isArray(metadata?.toolCallDetails) &&
      metadata.toolCallDetails.length > 0;

    const handleMessageClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor) {
        return;
      }
      const href = anchor.getAttribute("href") || "";
      if (!href.startsWith("myz-chunk://")) {
        return;
      }
      event.preventDefault();
      const chunkId = href.replace("myz-chunk://", "");
      const snippet = anchor.getAttribute("title") || anchor.textContent || "";
      pageStore.scrollToCitation(chunkId, snippet);
    };

    const renderMessage = (msg: Message) => {
      if (msg.metadata?.type === "page_context") {
        return <SystemMessageBubble key={msg.id} message={msg} />;
      }

      if (msg.role === "user") {
        return <UserMessageBubble key={msg.id} message={msg} />;
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
        );
      }

      if (msg.role === "tool") {
        return (
          <ToolMessageCard
            key={msg.id}
            message={msg}
            onView={(msg) => uiStore.openToolResponse(msg)}
          />
        );
      }

      if (msg.role === "assistant") {
        return (
          <AssistantMessageBubble
            key={msg.id}
            message={msg}
            onSave={() => uiStore.openSaveModal(msg)}
            onToolDetails={(msg) => uiStore.openToolInvocationDetails(msg)}
            isSaving={uiStore.isSavingHighlight}
          />
        );
      }

      return null;
    };

    return () => (
      <div
        class="flex flex-1 flex-col space-y-3 overflow-y-auto px-3 py-4 pr-4"
        ref={messageListRef}
        onClick={handleMessageClick}
      >
        {messageEntries.value.length === 0 && <ConversationEmptyState />}

        {messageEntries.value.map((msg) => renderMessage(msg))}

        {chatStore.hasActiveStream && <StreamingMessage stream={chatStore.activeStream} />}

        {chatStore.isLoading && (
          <div class="flex items-center justify-center gap-2 text-sm text-slate-500">
            <span class="animate-spin">⏳</span>
            AI 正在思考...
          </div>
        )}
      </div>
    );
  },
});
