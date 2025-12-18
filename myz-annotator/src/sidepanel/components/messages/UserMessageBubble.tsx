import { defineComponent } from "vue";
import { renderMarkdown } from "@/shared/markdownRenderer.js";

interface UserMessage {
  id: string;
  content: string;
  timestamp: string;
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
    return () => (
      <div class="ml-auto w-full max-w-[85%] rounded-2xl border border-indigo-500 bg-indigo-500 px-4 py-3 text-sm text-white shadow-md dark:border-indigo-600">
        <div class="mb-2 flex items-center justify-between text-xs font-semibold text-white/80">
          <span>用户</span>
          <span>{new Date(props.message?.timestamp || "").toLocaleString()}</span>
        </div>
        {props.message?.content && (
          <div
            class="prose prose-sm max-w-none text-white"
            v-html={renderMarkdown(props.message?.content)}
          />
        )}
      </div>
    );
  },
});
