import {
  defineComponent,
  onMounted,
  onBeforeUnmount,
} from "vue";
import { useChatStore } from "./stores/chat.js";
import { usePageStore } from "./stores/page.js";
import { useUIStore } from "./stores/ui.js";
import AutoInsightsPanel from "./components/AutoInsightsPanel.jsx";
import ConversationList from "./components/ConversationList.jsx";
import InputComposer from "./components/InputComposer.jsx";
import InterestsPanel from "./components/InterestsPanel.jsx";
import PageContextCard from "./components/PageContextCard.jsx";
import ToolResponseModal from "./components/ToolResponseModal.jsx";
import HistoryView from "./HistoryView.jsx";
import SaveHighlightModal from "./SaveHighlightModal.jsx";
import ThemeToggle from "@/shared/components/ThemeToggle.jsx";

export default defineComponent({
  name: "SidePanelApp",
  setup() {
    const chatStore = useChatStore();
    const pageStore = usePageStore();
    const uiStore = useUIStore();

    function showHistory() {
      uiStore.setView("history");
      chatStore.resetActiveStream();
      chatStore.closeAutoInsights();
    }

    onMounted(async () => {
      await pageStore.loadPageContext();
      await chatStore.initialize();
    });

    onBeforeUnmount(() => {
      chatStore.cleanup();
      pageStore.clearPageChunkAnchors();
    });

    return () => (
      <div class="flex h-screen flex-col bg-slate-50 px-4 py-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {uiStore.view === "related" && pageStore.relatedMatches.length ? (
          <InterestsPanel />
        ) : uiStore.view === "history" ? (
          <HistoryView />
        ) : (
          <>
            <header class="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div class="flex items-center gap-2">
                <h1 class="text-lg font-semibold">AI 智能助理</h1>
                {chatStore.contextInfo.needsCompression && (
                  <span class="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
                    ⚠️ {Math.round(chatStore.contextInfo.percentage)}%
                  </span>
                )}
              </div>
              <div class="flex items-center gap-2">
                <ThemeToggle size="sm" />
                <button
                  class="inline-flex items-center rounded-full border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-200"
                  onClick={showHistory}
                  title="查看对话历史"
                >
                  历史
                </button>
              </div>
            </header>
            {chatStore.autoInsights.active && chatStore.autoInsights.loading && (
              <p class="mt-2 text-xs text-indigo-600 dark:text-indigo-300">
                正在生成
                {chatStore.autoInsights.action === "key_points" ? "要点" : "摘要"}...
              </p>
            )}
            {chatStore.autoInsights.active &&
              !chatStore.autoInsights.loading &&
              chatStore.autoInsights.error && (
                <p class="mt-2 text-xs text-rose-600 dark:text-rose-400">
                  {chatStore.autoInsights.error}
                </p>
              )}

            <PageContextCard />

            <section class="mt-4 flex flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              {chatStore.autoInsights.active &&
              (chatStore.autoInsights.action === "summarize" ||
                chatStore.autoInsights.action === "key_points") ? (
                <AutoInsightsPanel />
              ) : (
                <div class="flex h-full flex-col">
                  <ConversationList />
                  <InputComposer />
                </div>
              )}
            </section>

            <SaveHighlightModal />
          </>
        )}
        <ToolResponseModal />
      </div>
    );
  },
});
