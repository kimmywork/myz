import { defineComponent } from "vue";
import { renderMarkdown } from "../../../shared/markdownRenderer.js";
import ToolInlineNotice from "./ToolInlineNotice.jsx";
import { resolveToolNames } from "./messageUtils.js";

export default defineComponent({
  name: "AssistantMessageBubble",
  props: {
    message: {
      type: Object,
      required: true,
    },
    onSave: {
      type: Function,
      required: true,
    },
    onToolDetails: {
      type: Function,
      required: true,
    },
    isSaving: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const hasToolCalls = (message) => Boolean(message?.metadata?.hasToolCalls);

    return () => (
      <div class="w-full max-w-[85%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <div class="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>AI助手</span>
          <span>{new Date(props.message.timestamp).toLocaleString()}</span>
        </div>
        {props.message.metadata?.streamingError && (
          <div class="mb-2 text-xs text-rose-500">
            ⚠️ {props.message.metadata.streamingError}
          </div>
        )}
        {hasToolCalls(props.message) && (
          <ToolInlineNotice
            text={`🔧 AI正在通过以下工具检索信息: ${
              resolveToolNames(props.message.metadata) || "处理中..."
            }`}
            timestamp=""
            showButton={
              Array.isArray(props.message.metadata?.toolCallDetails) &&
              props.message.metadata.toolCallDetails.length > 0
            }
            onDetails={() => props.onToolDetails(props.message)}
            size="lg"
          />
        )}
        {props.message.content && (
          <div
            class="prose prose-sm mt-3 max-w-none text-slate-800 dark:prose-invert"
            v-html={renderMarkdown(props.message.content)}
          />
        )}
        <div class="mt-3 flex justify-end">
          <button
            class="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300"
            onClick={() => props.onSave(props.message.id)}
            disabled={props.isSaving || props.message.metadata?.streaming}
          >
            保存
          </button>
        </div>
      </div>
    );
  },
});
