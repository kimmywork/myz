import { computed, defineComponent } from "vue";
import ConversationEmptyState from "./messages/ConversationEmptyState.jsx";
import StreamingMessage from "./messages/StreamingMessage.jsx";
import ToolInlineNotice from "./messages/ToolInlineNotice.jsx";
import ToolMessageCard from "./messages/ToolMessageCard.jsx";
import AssistantMessageBubble from "./messages/AssistantMessageBubble.jsx";
import UserMessageBubble from "./messages/UserMessageBubble.jsx";
import SystemMessageBubble from "./messages/SystemMessageBubble.jsx";
import { resolveToolNames } from "./messages/messageUtils.js";

function isToolInvocationNotice(msg) {
  if (!msg || msg.role !== "assistant" || !msg.metadata?.hasToolCalls) {
    return false;
  }
  if (msg.metadata?.toolInvocationOnly) return true;
  const text = (msg.content || "").trim();
  if (!text) return true;
  const pattern = /\[Tool\s+\d+:[^\]]+\]/g;
  const matches = text.match(pattern);
  if (!matches) return false;
  return text.replace(pattern, "").trim().length === 0;
}

export default defineComponent({
  name: "ConversationList",
  props: {
    messages: {
      type: Array,
      required: true,
    },
    listRef: {
      type: Object,
      required: true,
    },
    onToolDetails: {
      type: Function,
      required: true,
    },
    onToolResponse: {
      type: Function,
      required: true,
    },
    onSaveAssistant: {
      type: Function,
      required: true,
    },
    isSavingHighlight: {
      type: Boolean,
      default: false,
    },
    streaming: {
      type: Object,
      required: true,
    },
    hasActiveStream: {
      type: Boolean,
      default: false,
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const messageEntries = computed(() =>
      props.messages
        .filter(Boolean)
        .filter((msg) => msg.metadata?.type !== "streaming_preview"),
    );

    const hasDetails = (metadata) =>
      Array.isArray(metadata?.toolCallDetails) &&
      metadata.toolCallDetails.length > 0;

    const renderMessage = (msg) => {
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
              hasDetails(msg.metadata) ? () => props.onToolDetails(msg) : null
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
            onView={props.onToolResponse}
          />
        );
      }

      if (msg.role === "assistant") {
        return (
          <AssistantMessageBubble
            key={msg.id}
            message={msg}
            onSave={props.onSaveAssistant}
            onToolDetails={props.onToolDetails}
            isSaving={props.isSavingHighlight}
          />
        );
      }

      return null;
    };

    return () => (
      <div
        class="flex flex-1 flex-col space-y-3 overflow-y-auto px-3 py-4 pr-4"
        ref={props.listRef}
      >
        {messageEntries.value.length === 0 && <ConversationEmptyState />}

        {messageEntries.value.map((msg) => renderMessage(msg))}

        {props.hasActiveStream && <StreamingMessage stream={props.streaming} />}

        {props.isLoading && (
          <div class="flex items-center justify-center gap-2 text-sm text-slate-500">
            <span class="animate-spin">⏳</span>
            AI 正在思考...
          </div>
        )}
      </div>
    );
  },
});
