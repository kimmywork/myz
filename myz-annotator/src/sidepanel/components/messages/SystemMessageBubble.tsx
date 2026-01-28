import { defineComponent } from "vue";
import { renderMarkdown } from "@/shared/markdownRenderer.js";

interface SystemMessage {
  id: string;
  content: string;
  timestamp: string;
}

interface SystemMessageBubbleProps {
  message?: SystemMessage;
}

export default defineComponent({
  name: "SystemMessageBubble",
  props: {
    message: {
      type: Object,
      required: true,
      default: () => ({}),
    },
  },
  setup(props: SystemMessageBubbleProps) {
    return () => (
      <div class="w-full max-w-[85%] rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        <div class="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide">
          <span>页面上下文</span>
          <span>
            {new Date(props.message?.timestamp || "").toLocaleString()}
          </span>
        </div>
        {props.message?.content && (
          <div
            class="prose prose-xs max-w-none dark:prose-invert"
            v-html={renderMarkdown(props.message?.content)}
          />
        )}
      </div>
    );
  },
});
