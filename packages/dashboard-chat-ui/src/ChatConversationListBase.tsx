import { defineComponent } from "vue"
import type { PropType } from "vue"
import type { ChatMessageLike } from "./types"

export default defineComponent({
  name: "ChatConversationListBase",
  props: {
    messages: {
      type: Array as PropType<ChatMessageLike[]>,
      required: true,
    },
    renderEmptyState: {
      type: Function as PropType<() => unknown>,
      required: true,
    },
    renderMessage: {
      type: Function as PropType<(message: ChatMessageLike) => unknown>,
      required: true,
    },
    renderStreaming: {
      type: Function as PropType<() => unknown>,
      default: null,
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
    loadingText: {
      type: String,
      default: "AI 正在思考...",
    },
    setMessageListRef: {
      type: Function as PropType<(element: Element | null) => void>,
      required: false,
    },
    onContainerClick: {
      type: Function as PropType<(event: MouseEvent) => void>,
      required: false,
    },
  },
  setup(props) {
    return () => (
      <div
        class="flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto px-3 py-4 pr-4"
        ref={(element) => props.setMessageListRef?.(element as Element | null)}
        onClick={props.onContainerClick}
      >
        {props.messages.length === 0 ? props.renderEmptyState() : null}
        {props.messages.map((message) => props.renderMessage(message))}
        {props.renderStreaming?.()}
        {props.isLoading ? (
          <div class="flex items-center justify-center gap-2 text-sm text-slate-500">
            <span class="animate-spin">⏳</span>
            {props.loadingText}
          </div>
        ) : null}
      </div>
    )
  },
})
