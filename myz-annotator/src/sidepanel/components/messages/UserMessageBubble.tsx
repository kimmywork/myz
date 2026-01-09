import { defineComponent } from "vue";
import { renderMarkdown } from "@/shared/markdownRenderer.js";
import type { ImageAttachment } from "@/background/ai/types.js";

interface UserMessage {
  id: string;
  content: string;
  timestamp: string;
  metadata?: {
    attachments?: ImageAttachment[];
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
    const renderAttachments = (items: ImageAttachment[]) => (
      <div class="mt-3 flex flex-wrap gap-2">
        {items.map((item, index) => (
          <a
            class="block h-28 w-28 overflow-hidden rounded-xl border border-white/20 bg-white/10"
            href={item.dataUrl}
            target="_blank"
            rel="noreferrer"
            title={item.name || "图片"}
          >
            <img
              src={item.dataUrl}
              class="h-full w-full object-cover"
              alt={item.name || `image-${index + 1}`}
            />
          </a>
        ))}
      </div>
    );

    return () => (
      <div class="ml-auto w-full max-w-[85%] rounded-2xl border border-indigo-500 bg-indigo-500 px-4 py-3 text-sm text-white shadow-md dark:border-indigo-600">
        <div class="mb-2 flex items-center justify-between text-xs font-semibold text-white/80">
          <span>用户</span>
          <span>
            {new Date(props.message?.timestamp || "").toLocaleString()}
          </span>
        </div>
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
  },
});
