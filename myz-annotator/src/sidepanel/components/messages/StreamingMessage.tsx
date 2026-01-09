import { computed, defineComponent, ref } from "vue";
import { MessageStream } from "@/background/ai/types.js";
import { renderMarkdown } from "@/shared/markdownRenderer.js";

interface StreamingMessageProps {
  stream?: MessageStream;
}

export default defineComponent({
  name: "StreamingMessage",
  props: {
    stream: {
      type: Object,
      required: true,
      default: () => ({}),
    },
  },
  setup(props: StreamingMessageProps) {
    const showReasoning = ref(false);
    const reasoningText = computed(() =>
      (props.stream?.reasoning || "").trim(),
    );
    const hasReasoning = computed(() => Boolean(reasoningText.value));

    return () => (
      <div class="w-full max-w-[85%] rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <div class="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>AI助手</span>
          <span>
            {props.stream?.timestamp
              ? new Date(props.stream?.timestamp).toLocaleString()
              : new Date().toLocaleString()}
          </span>
        </div>
        {hasReasoning.value && (
          <div class="mt-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-indigo-200">
            <button
              class="flex w-full items-center justify-between text-left font-semibold"
              onClick={() => {
                showReasoning.value = !showReasoning.value;
              }}
            >
              <span>🧠 推理中</span>
              <span class="text-[11px] font-medium">
                {showReasoning.value ? "收起" : "展开"}
              </span>
            </button>
            {showReasoning.value && (
              <div
                class="prose prose-sm mt-2 max-w-none dark:prose-invert"
                v-html={renderMarkdown(reasoningText.value)}
              />
            )}
          </div>
        )}
        {props.stream?.content ? (
          <div
            class="prose prose-sm max-w-none dark:prose-invert"
            v-html={renderMarkdown(props.stream?.content)}
          />
        ) : (
          <div class="text-xs text-slate-500 dark:text-slate-300">
            AI 正在生成回答...
          </div>
        )}
      </div>
    );
  },
});
