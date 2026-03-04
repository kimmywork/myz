import { defineComponent } from "vue";
import { useUIStore } from "../../stores/ui.js";
import ToolInlineNotice from "./ToolInlineNotice.jsx";
import type { ImageAttachment } from "@/background/ai/types.js";
import { renderMarkdown } from "@/shared/markdownRenderer.js";

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

interface UserMessageBubbleProps {
  message?: UserMessage;
}

export default defineComponent({
  name: "UserMessageBubble",
  props: {
    message: {
      type: Object,
      required: true,
      default: () => ({}),
    },
  },
  setup(props: UserMessageBubbleProps) {
    const uiStore = useUIStore();
    const resolveSkillNames = () => {
      const raw = props.message?.metadata?.skillNames;
      if (Array.isArray(raw)) {
        return raw.map((name) => String(name).trim()).filter(Boolean);
      }
      if (typeof raw === "string" && raw.trim()) {
        return [raw.trim()];
      }
      return [];
    };

    const renderAttachments = (items: ImageAttachment[]) => (
      <div class="mt-3 flex flex-wrap gap-2">
        {items.map((item, index) => (
          <button
            type="button"
            class="block h-28 w-28 overflow-hidden rounded-xl border border-white/20 bg-white/10"
            title={item.name || "图片预览"}
            onClick={() =>
              uiStore.openImagePreview({
                dataUrl: item.dataUrl,
                title: item.name || "图片预览",
              })
            }
          >
            <img
              src={item.dataUrl}
              class="h-full w-full object-cover"
              alt={item.name || `image-${index + 1}`}
            />
          </button>
        ))}
      </div>
    );

    return () => {
      const skillNames = resolveSkillNames();
      return (
        <div class="ml-auto w-full max-w-[85%] rounded-2xl border border-indigo-500 bg-indigo-500 px-4 py-3 text-sm text-white shadow-md dark:border-indigo-600">
          <div class="mb-2 flex items-center justify-between text-xs font-semibold text-white/80">
            <span>用户</span>
            <span>
              {new Date(props.message?.timestamp || "").toLocaleString()}
            </span>
          </div>
          {skillNames.length > 0 && (
            <div class="mb-3">
              <ToolInlineNotice
                text={`使用技能：${skillNames.join("、")}`}
                timestamp=""
                showButton={false}
                size="sm"
              />
            </div>
          )}
          {typeof props.message?.metadata?.selectionContextText === "string" &&
            props.message.metadata.selectionContextText.trim() && (
              <div class="mb-3 rounded-2xl border border-white/20 bg-white/10 px-3 py-2 text-xs text-white/90">
                <div class="mb-1 text-[11px] font-semibold text-white/80">
                  选中内容（上下文）
                </div>
                <div class="max-h-40 overflow-auto whitespace-pre-wrap">
                  {props.message.metadata.selectionContextText}
                </div>
              </div>
            )}
          {props.message?.content && (
            <div
              class="prose prose-sm max-w-none text-white"
              v-html={renderMarkdown(props.message?.content)}
            />
          )}
          {Array.isArray(props.message?.metadata?.attachments) &&
            props.message.metadata.attachments.length > 0 &&
            renderAttachments(props.message.metadata.attachments)}
        </div>
      );
    };
  },
});
