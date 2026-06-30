import { defineComponent, onMounted, onBeforeUnmount } from "vue";
import AutoInsightsPanel from "./components/AutoInsightsPanel.jsx";
import ContextStatusBar from "./components/ContextStatusBar.jsx";
import ConversationList from "./components/ConversationList.jsx";
import ImagePreviewModal from "./components/ImagePreviewModal.jsx";
import InputComposer from "./components/InputComposer.jsx";
import TaskPlanPanel from "./components/TaskPlanPanel.jsx";
import ToolResponseModal from "./components/ToolResponseModal.jsx";
import HistoryView from "./HistoryView.jsx";
import SaveHighlightModal from "./SaveHighlightModal.jsx";
import { useChatStore } from "./stores/chat.js";
import { usePageStore } from "./stores/page.js";
import { useUIStore } from "./stores/ui.js";
import ThemeToggle from "@/shared/components/ThemeToggle.jsx";
import { IconChatPlus, IconHistory, IconSettings } from "@/shared/icons.js";

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

    function openDashboard() {
      chrome.runtime.openOptionsPage();
    }

    async function startNewConversation() {
      await chatStore.startNewConversationForContext();
    }

    onMounted(async () => {
      await chatStore.initialize();
      if (!pageStore.currentTabId) {
        await pageStore.loadPageContext();
      }
      pageStore.startTabTracking();
    });

    onBeforeUnmount(() => {
      chatStore.cleanup();
      pageStore.stopTabTracking();
      pageStore.clearPageChunkAnchors();
    });

    return () => (
      <div class="flex h-screen flex-col bg-slate-50 px-4 py-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {uiStore.view === "history" ? (
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
                  class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-200"
                  onClick={startNewConversation}
                  title="为当前页面开启新对话"
                  aria-label="新对话"
                >
                  <IconChatPlus size={20} aria-hidden="true" />
                </button>
                <button
                  class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-200"
                  onClick={showHistory}
                  title="查看对话历史"
                  aria-label="历史"
                >
                  <IconHistory size={20} aria-hidden="true" />
                </button>
                <button
                  class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-200"
                  onClick={openDashboard}
                  title="打开 Dashboard"
                  aria-label="打开 Dashboard"
                >
                  <IconSettings size={20} aria-hidden="true" />
                </button>
              </div>
            </header>
            <ContextStatusBar />
            {chatStore.isAgentMode && <TaskPlanPanel />}
            {chatStore.autoInsights.active &&
              chatStore.autoInsights.loading && (
                <p class="mt-2 text-xs text-indigo-600 dark:text-indigo-300">
                  正在生成
                  {chatStore.autoInsights.action === "key_points"
                    ? "要点"
                    : "摘要"}
                  ...
                </p>
              )}
            {chatStore.autoInsights.active &&
              !chatStore.autoInsights.loading &&
              chatStore.autoInsights.error && (
                <p class="mt-2 text-xs text-rose-600 dark:text-rose-400">
                  {chatStore.autoInsights.error}
                </p>
              )}

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
        <ImagePreviewModal />
      </div>
    );
  },
});
