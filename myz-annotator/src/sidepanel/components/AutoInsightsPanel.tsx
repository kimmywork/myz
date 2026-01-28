import { defineComponent, computed } from "vue";
import { renderMarkdown } from "@/shared/markdownRenderer.js";
import { useChatStore } from "../stores/chat";
import { usePageStore } from "../stores/page";
import { storeToRefs } from "pinia";

const ACTION_LABELS: Record<string, string> = {
  summarize: "总结页面内容",
  key_points: "发现关键要点",
};

export interface AutoInsightsState {
  action: string;
  active: boolean;
  loading: boolean;
  error: string | null;
  markdown: string | null;
  context: {
    chunkCount?: number;
    wordCount?: number;
    truncated?: boolean;
  } | null;
  chunkGroups: number;
  generatedAt: string | null;
}

export default defineComponent({
  name: "AutoInsightsPanel",
  setup() {
    const chatStore = useChatStore();
    const pageStore = usePageStore();
    const { autoInsights } = storeToRefs(chatStore);

    const actionLabel = computed(
      () => ACTION_LABELS[autoInsights.value.action || "summarize"],
    );

    function renderContextMeta() {
      const context = autoInsights.value.context;
      if (!context) {
        return "";
      }
      const parts = [];
      if (context.chunkCount) {
        parts.push(`${context.chunkCount} 个片段`);
      }
      if (autoInsights.value.chunkGroups && autoInsights.value.chunkGroups > 1) {
        parts.push(`共 ${autoInsights.value.chunkGroups} 批`);
      }
      if (context.wordCount) {
        parts.push(`${context.wordCount} 词`);
      }
      if (context.truncated) {
        parts.push("已截断");
      }
      return parts.join(" · ");
    }

    function handleMarkdownClick(event: MouseEvent) {
      const anchor = (event.target as HTMLElement).closest("a");
      if (!anchor) {
        return;
      }
      const href = anchor.getAttribute("href") || "";
      if (!href.startsWith("myz-chunk://") && !href.startsWith("myz-chunk-")) {
        return;
      }
      event.preventDefault();
      const chunkId = href.replace("myz-chunk://", "");
      const snippet = anchor.getAttribute("title") || anchor.textContent || "";
      pageStore.scrollToCitation(chunkId, snippet);
    }

    function handleRetry() {
      chatStore.runAutoInsights(autoInsights.value.action);
    }

    function handleClose() {
      chatStore.closeAutoInsights();
    }

    function renderBody() {
      if (autoInsights.value.loading) {
        return (
          <div class="flex flex-1 flex-col items-center justify-center text-sm text-slate-500 dark:text-slate-300">
            <span class="mb-2 animate-spin text-2xl">⏳</span>
            正在分析页面内容...
          </div>
        );
      }
      if (autoInsights.value.error) {
        return (
          <div class="flex flex-1 flex-col items-center justify-center text-sm text-rose-500 dark:text-rose-300">
            <p>{autoInsights.value.error}</p>
            <button
              type="button"
              class="mt-4 inline-flex items-center rounded-full bg-rose-500/90 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-600"
              onClick={handleRetry}
            >
              重新生成
            </button>
          </div>
        );
      }
      if (!autoInsights.value.markdown) {
        return (
          <p class="text-sm text-slate-500 dark:text-slate-300">
            暂无内容，请重新生成。
          </p>
        );
      }
      return (
        <article
          class="prose prose-sm max-w-none dark:prose-invert"
          onClick={handleMarkdownClick}
          innerHTML={renderMarkdown(autoInsights.value.markdown ?? "")}
        ></article>
      );
    }

    return () => (
      <div class="flex h-full flex-col">
        <header class="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <p class="text-xs uppercase text-slate-400 dark:text-slate-500">
              自动分析
            </p>
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
              {actionLabel.value}
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {renderContextMeta() || "基于当前页面内容"}
            </p>
          </div>
          <div class="flex items-center gap-2">
            {!autoInsights.value.loading && (
              <button
                type="button"
                class="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-200"
                onClick={handleRetry}
              >
                重新生成
              </button>
            )}
            <button
              type="button"
              class="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-indigo-500 dark:hover:bg-indigo-400"
              onClick={handleClose}
            >
              返回对话
            </button>
          </div>
        </header>

        <section class="flex-1 overflow-y-auto px-4 py-4">
          {renderBody()}
        </section>

        {autoInsights.value.generatedAt && (
          <footer class="border-t border-slate-200 px-4 py-2 text-right text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
            生成时间：{new Date(autoInsights.value.generatedAt).toLocaleString()}
          </footer>
        )}
      </div>
    );
  },
});
