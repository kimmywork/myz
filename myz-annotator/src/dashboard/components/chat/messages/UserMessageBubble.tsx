import {
  ToolInlineNotice,
  UserMessageBubble as SharedUserMessageBubble,
} from "@myz/dashboard-chat-ui"
import { defineComponent } from "vue"
import type { ImageAttachment } from "@/background/ai/types.js"
import { useChatUIStore } from "@/dashboard/stores/chatUi.js"

interface UserMessage {
  id: string
  content: string
  timestamp: string
  metadata?: {
    attachments?: ImageAttachment[]
    selectionContextText?: string
    skillNames?: string[] | string
  }
}

export default defineComponent({
  name: "DashboardUserMessageBubble",
  props: {
    message: {
      type: Object as () => UserMessage,
      required: true,
    },
  },
  setup(props) {
    const uiStore = useChatUIStore()

    function resolveSkillNames() {
      const raw = props.message?.metadata?.skillNames
      if (Array.isArray(raw)) {
        return raw.map((name) => String(name).trim()).filter(Boolean)
      }
      if (typeof raw === "string" && raw.trim()) {
        return [raw.trim()]
      }
      return []
    }

    return () => {
      const skillNames = resolveSkillNames()

      return (
        <SharedUserMessageBubble
          message={props.message}
          onPreviewAttachment={(attachment) =>
            uiStore.openImagePreview({
              dataUrl: attachment.dataUrl,
              title: attachment.name || "图片预览",
            })
          }
          renderBeforeContent={() =>
            skillNames.length > 0 ? (
              <div class="mb-3">
                <ToolInlineNotice
                  text={`使用技能：${skillNames.join("、")}`}
                  showButton={false}
                  size="sm"
                />
              </div>
            ) : null
          }
        />
      )
    }
  },
})
