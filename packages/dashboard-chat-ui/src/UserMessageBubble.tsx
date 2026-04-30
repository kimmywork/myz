import { renderMarkdown } from "@myz/shared/markdownRenderer"
import { defineComponent } from "vue"
import type { PropType } from "vue"
import type { ChatAttachmentLike, ChatMessageLike } from "./types"

function normalizeAttachments(message?: ChatMessageLike) {
  const rawAttachments = message?.metadata?.attachments
  if (!Array.isArray(rawAttachments)) {
    return []
  }
  return rawAttachments.filter(
    (item): item is ChatAttachmentLike => item?.type === "image" && !!item.dataUrl,
  )
}

export default defineComponent({
  name: "UserMessageBubble",
  props: {
    message: {
      type: Object as PropType<ChatMessageLike>,
      required: true,
    },
    onPreviewAttachment: {
      type: Function as PropType<(attachment: ChatAttachmentLike, index: number) => void>,
      required: false,
    },
    renderBeforeContent: {
      type: Function as PropType<() => unknown>,
      default: null,
    },
  },
  setup(props) {
    return () => {
      const attachments = normalizeAttachments(props.message)

      return (
        <div class="ml-auto w-full max-w-[85%] rounded-2xl border border-indigo-500 bg-indigo-500 px-4 py-3 text-sm text-white shadow-md dark:border-indigo-600">
          <div class="mb-2 flex items-center justify-between text-xs font-semibold text-white/80">
            <span>用户</span>
            <span>{new Date(props.message?.timestamp || "").toLocaleString()}</span>
          </div>
          {props.renderBeforeContent?.()}
          {props.message?.content ? (
            <div
              class="prose prose-sm max-w-none text-white"
              v-html={renderMarkdown(props.message.content)}
            />
          ) : null}
          {attachments.length ? (
            <div class="mt-3 flex flex-wrap gap-2">
              {attachments.map((attachment, index) => (
                <button
                  key={`${attachment.name || "image"}-${index}`}
                  type="button"
                  class="block h-28 w-28 overflow-hidden rounded-xl border border-white/20 bg-white/10"
                  title={attachment.name || "图片预览"}
                  onClick={() => props.onPreviewAttachment?.(attachment, index)}
                >
                  <img
                    src={attachment.dataUrl}
                    class="h-full w-full object-cover"
                    alt={attachment.name || `image-${index + 1}`}
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )
    }
  },
})
