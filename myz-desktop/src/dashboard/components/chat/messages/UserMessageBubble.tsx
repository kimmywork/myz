import { UserMessageBubble as SharedUserMessageBubble } from "@myz/dashboard-chat-ui"
import { defineComponent } from "vue"
import type { Message } from "@myz/ai-core/types"
import { useChatUIStore } from "../../../stores/chatUi"

export default defineComponent({
  name: "DesktopUserMessageBubble",
  props: {
    message: {
      type: Object as () => Message,
      required: true,
    },
  },
  setup(props) {
    const uiStore = useChatUIStore()

    return () => (
      <SharedUserMessageBubble
        message={props.message}
        onPreviewAttachment={(attachment) =>
          uiStore.openImagePreview({
            dataUrl: attachment.dataUrl,
            title: attachment.name || "图片预览",
          })
        }
      />
    )
  },
})
