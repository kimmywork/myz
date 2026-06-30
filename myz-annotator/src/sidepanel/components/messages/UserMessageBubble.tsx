import {
  ToolInlineNotice,
  UserMessageBubble as SharedUserMessageBubble,
} from "@myz/dashboard-chat-ui";
import { defineComponent } from "vue";
import { useUIStore } from "../../stores/ui.js";
import type { ImageAttachment } from "@/background/ai/types.js";

interface UserMessage {
  id: string;
  content: string;
  timestamp: string;
  metadata?: {
    attachments?: ImageAttachment[];
    selectionContextText?: string;
    skillNames?: string[] | string;
  };
}

export default defineComponent({
  name: "UserMessageBubble",
  props: {
    message: {
      type: Object as () => UserMessage,
      required: true,
    },
  },
  setup(props) {
    const uiStore = useUIStore();

    function resolveSkillNames() {
      const raw = props.message?.metadata?.skillNames;
      if (Array.isArray(raw)) {
        return raw.map((name) => String(name).trim()).filter(Boolean);
      }
      if (typeof raw === "string" && raw.trim()) {
        return [raw.trim()];
      }
      return [];
    }

    return () => {
      const skillNames = resolveSkillNames();
      const selectionContextText =
        props.message?.metadata?.selectionContextText?.trim();

      return (
        <SharedUserMessageBubble
          message={props.message}
          onPreviewAttachment={(attachment) =>
            uiStore.openImagePreview({
              dataUrl: attachment.dataUrl,
              title: attachment.name || "图片预览",
            })
          }
          renderBeforeContent={() => (
            <>
              {skillNames.length > 0 ? (
                <div class="mb-3">
                  <ToolInlineNotice
                    text={`使用技能：${skillNames.join("、")}`}
                    showButton={false}
                    size="sm"
                  />
                </div>
              ) : null}
              {selectionContextText ? (
                <div class="mb-3 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-white/90">
                  <div class="mb-1 text-[11px] font-semibold text-white/80">
                    选中内容（上下文）
                  </div>
                  <div class="max-h-40 overflow-auto whitespace-pre-wrap">
                    {selectionContextText}
                  </div>
                </div>
              ) : null}
            </>
          )}
        />
      );
    };
  },
});
