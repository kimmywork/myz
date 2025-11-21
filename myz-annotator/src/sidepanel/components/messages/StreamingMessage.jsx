import { defineComponent } from "vue";
import { renderMarkdown } from "../../../shared/markdownRenderer.js";

export default defineComponent({
  name: "StreamingMessage",
  props: {
    stream: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <div class="w-full max-w-[85%] rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <div class="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>AI助手</span>
          <span>
            {props.stream.timestamp
              ? new Date(props.stream.timestamp).toLocaleString()
              : new Date().toLocaleString()}
          </span>
        </div>
        {props.stream.content ? (
          <div
            class="prose prose-sm max-w-none text-slate-700 dark:prose-invert"
            v-html={renderMarkdown(props.stream.content)}
          />
        ) : (
          <div class="text-xs text-slate-500">AI 正在生成回答...</div>
        )}
      </div>
    );
  },
});
