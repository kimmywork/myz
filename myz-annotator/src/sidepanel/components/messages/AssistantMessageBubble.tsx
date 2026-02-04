import { computed, defineComponent, ref, watch } from "vue";
import { resolveToolNames } from "./messageUtils.js";
import ToolInlineNotice from "./ToolInlineNotice.jsx";
import { renderMarkdown } from "@/shared/markdownRenderer.js";

export interface AssistantMessageMetadata {
  hasToolCalls?: boolean;
  toolCallDetails?: Array<any>;
  reasoning?: string;
  streamingError?: string;
  streaming?: boolean;
  toolNames?: string[] | string;
  toolCallCount?: number;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  contextWindow?: number;
  requestDurationMs?: number;
}

export interface AssistantMessage {
  id: string;
  content: string;
  timestamp: string;
  metadata?: AssistantMessageMetadata;
}

export interface AssistantMessageBubbleProps {
  message?: AssistantMessage;
  onSave?: (messageId: string) => void;
  onToolDetails?: (message: any) => void;
  isSaving?: boolean;
}

export default defineComponent({
  name: "AssistantMessageBubble",
  props: {
    message: {
      type: Object,
      required: true,
      default: () => ({}),
    },
    onSave: {
      type: Function,
      required: false,
    },
    onToolDetails: {
      type: Function,
      required: false,
    },
    isSaving: {
      type: Boolean,
      required: false,
      default: false,
    },
  },
  setup(props: AssistantMessageBubbleProps) {
    const hasToolCalls = (message?: AssistantMessage) =>
      Boolean(message?.metadata?.hasToolCalls);
    const showReasoning = ref(false);
    const copyStatus = ref<"idle" | "success" | "error">("idle");
    let copyTimer: ReturnType<typeof setTimeout> | null = null;
    const modelName = computed(() => String(props.message?.metadata?.model || "").trim());
    const reasoningText = computed(() =>
      (props.message?.metadata?.reasoning || "").trim(),
    );
    const hasReasoning = computed(() => Boolean(reasoningText.value));
    const formatTokenCount = (value: number) => {
      if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1)}M`;
      }
      if (value >= 10_000) {
        return `${Math.round(value / 1_000)}k`;
      }
      return String(value);
    };
    const usageSummary = computed(() => {
      const usage = props.message?.metadata?.usage;
      const contextWindow = props.message?.metadata?.contextWindow;
      if (!usage || !contextWindow) return "";
      const totalTokens =
        typeof usage.total_tokens === "number"
          ? usage.total_tokens
          : typeof usage.totalTokens === "number"
            ? usage.totalTokens
            : 0;
      if (!totalTokens) return "";
      const percent = Math.min(100, (totalTokens / contextWindow) * 100);
      const completionTokens =
        typeof usage.completion_tokens === "number"
          ? usage.completion_tokens
          : typeof usage.completionTokens === "number"
            ? usage.completionTokens
            : 0;
      const durationMs =
        typeof props.message?.metadata?.requestDurationMs === "number"
          ? props.message?.metadata?.requestDurationMs
          : 0;
      const seconds = durationMs > 0 ? durationMs / 1000 : 0;
      const rate = seconds > 0 ? completionTokens / seconds : 0;
      return `Token用量： ${formatTokenCount(totalTokens)}/${formatTokenCount(
        contextWindow,
      )}(${percent.toFixed(
        0,
      )} %)，Token速率：${rate.toFixed(2)} tokens/s`;
    });

    const copyLabel = computed(() => {
      if (copyStatus.value === "success") return "已复制";
      if (copyStatus.value === "error") return "复制失败";
      return "复制";
    });

    const resetCopyStatus = () => {
      copyStatus.value = "idle";
      if (copyTimer) {
        clearTimeout(copyTimer);
        copyTimer = null;
      }
    };

    const handleCopy = async () => {
      const text = String(props.message?.content || "");
      if (!text.trim()) return;
      try {
        await navigator.clipboard.writeText(text);
        copyStatus.value = "success";
      } catch {
        copyStatus.value = "error";
      } finally {
        if (copyTimer) {
          clearTimeout(copyTimer);
        }
        copyTimer = setTimeout(() => {
          copyStatus.value = "idle";
          copyTimer = null;
        }, 1600);
      }
    };

    watch(() => props.message?.id, () => {
      resetCopyStatus();
    });

    return () => (
      <div class="w-full max-w-[85%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
        <div class="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
          <span>
            AI助理{modelName.value ? ` · ${modelName.value}` : ""}
          </span>
          <span>
            {new Date(props.message?.timestamp || "").toLocaleString()}
          </span>
        </div>
        {props.message?.metadata?.streamingError && (
          <div class="mb-2 text-xs text-rose-500">
            ⚠️ {props.message.metadata.streamingError}
          </div>
        )}
        {hasToolCalls(props.message) && (
          <ToolInlineNotice
            text={`🔧 AI正在通过以下工具检索信息: ${
              resolveToolNames(props.message?.metadata) || "处理中..."
            }`}
            timestamp=""
            showButton={
              Array.isArray(props.message?.metadata?.toolCallDetails) &&
              props.message?.metadata?.toolCallDetails.length > 0
            }
            onDetails={() => props.onToolDetails?.(props.message)}
            size="lg"
          />
        )}
        {hasReasoning.value && (
          <div class="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
            <button
              class="flex w-full items-center justify-between text-left font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-200"
              onClick={() => {
                showReasoning.value = !showReasoning.value;
              }}
            >
              <span>🧠 推理过程</span>
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
        {props.message?.content && (
          <div
            class="prose prose-sm mt-3 max-w-none dark:prose-invert"
            v-html={renderMarkdown(props.message.content)}
          />
        )}
        <div class="mt-3 flex items-center justify-between gap-3">
          <span class="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {usageSummary.value}
          </span>
          <div class="flex items-center gap-2">
            <button
              class="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300"
              onClick={handleCopy}
              disabled={!String(props.message?.content || "").trim()}
            >
              {copyLabel.value}
            </button>
            <button
              class="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300"
              onClick={() => props.onSave?.(props.message?.id || "")}
              disabled={props.isSaving || props.message?.metadata?.streaming}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    );
  },
});
