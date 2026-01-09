import { computed, defineComponent } from "vue"
import { useChatStore } from "../stores/chat.js"
import { usePageStore } from "../stores/page.js"

function normalizeUrlForMatch(url: string) {
  try {
    const parsed = new URL(url)
    parsed.hash = ""
    return parsed.toString()
  } catch {
    return (url || "").split("#")[0] || ""
  }
}

function summarizeUrl(url: string) {
  if (!url) return ""
  try {
    const parsed = new URL(url)
    const path = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : ""
    return `${parsed.host}${path}`
  } catch {
    return url
  }
}

export default defineComponent({
  name: "ContextStatusBar",
  setup() {
    const chatStore = useChatStore()
    const pageStore = usePageStore()

    const threadUrl = computed(() => chatStore.conversationUrl || "")
    const threadTitle = computed(() => chatStore.conversationTitle || "")
    const contextUrl = computed(() => pageStore.currentUrl || "")
    const contextTitle = computed(() => pageStore.pageTitle || "")

    const isCrossContext = computed(() => {
      if (!threadUrl.value || !contextUrl.value) return false
      return (
        normalizeUrlForMatch(threadUrl.value) !== normalizeUrlForMatch(contextUrl.value)
      )
    })

    const threadLabel = computed(() => {
      if (!threadUrl.value && !threadTitle.value) return "未选择对话"
      return threadTitle.value || summarizeUrl(threadUrl.value) || "未命名对话"
    })

    const contextLabel = computed(() => {
      if (!contextUrl.value && !contextTitle.value) return "未选择页面"
      return contextTitle.value || summarizeUrl(contextUrl.value) || "未命名页面"
    })

    const canSwitchThreadToContext = computed(
      () => Boolean(contextUrl.value) && !chatStore.isLoading,
    )

    return () => (
      <div class="mt-3 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-xs text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-1 flex-wrap items-center gap-2">
            <span class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              线程: <span class="truncate">{threadLabel.value}</span>
            </span>
            <span class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              上下文: <span class="truncate">{contextLabel.value}</span>
            </span>
            {isCrossContext.value && (
              <span class="inline-flex items-center rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
                已跨页面
              </span>
            )}
          </div>
          <div class="flex items-center gap-2">
            <button
              class="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              onClick={() => pageStore.loadPageContext()}
              disabled={chatStore.isLoading}
              title="更新上下文为当前活动标签页"
            >
              使用当前标签页
            </button>
            <button
              class="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              onClick={() =>
                chatStore.switchToLatestConversationForCurrentContext({
                  createIfMissing: true,
                })
              }
              disabled={!canSwitchThreadToContext.value}
              title="切换线程到当前页面（若不存在则新建）"
            >
              切换线程到当前页面
            </button>
          </div>
        </div>

        {isCrossContext.value && (
          <div class="text-[11px] text-slate-500 dark:text-slate-400">
            当前线程与当前页面上下文不同；发送“页面上下文”会以当前页面为准。
          </div>
        )}
      </div>
    )
  },
})

