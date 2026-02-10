import { computed, defineComponent, ref, watch } from "vue"
import { useChatStore } from "../stores/chat.js"
import { usePageStore } from "../stores/page.js"
import { IconAgent, IconChat, IconSwitch } from "@/shared/icons.js"

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
    const isAgentMode = computed(() => chatStore.conversationMode === "agent")

    const isCrossContext = computed(() => {
      if (!threadUrl.value || !contextUrl.value) return false
      return (
        normalizeUrlForMatch(threadUrl.value) !== normalizeUrlForMatch(contextUrl.value)
      )
    })

    const titleText = computed(() => {
      if (threadTitle.value) return threadTitle.value
      if (threadUrl.value) return summarizeUrl(threadUrl.value)
      return "新对话"
    })

    const hasThreadForCurrentPage = ref(false)
    const isChecking = ref(false)

    async function refreshHasThreadForCurrentPage() {
      if (!isCrossContext.value) {
        hasThreadForCurrentPage.value = false
        return
      }
      const url = contextUrl.value
      if (!url) {
        hasThreadForCurrentPage.value = false
        return
      }
      isChecking.value = true
      try {
        const found = await chatStore.findLatestConversationForUrl(url)
        hasThreadForCurrentPage.value = Boolean(
          found?.id && found.id !== chatStore.conversationId,
        )
      } finally {
        isChecking.value = false
      }
    }

    watch(
      () => [isCrossContext.value, contextUrl.value, chatStore.conversationId],
      () => {
        void refreshHasThreadForCurrentPage()
      },
      { immediate: true },
    )

    return () => (
      <div class="mt-3 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-xs text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-200">
        <div class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
          {titleText.value}
        </div>
        {(isCrossContext.value || chatStore.superpowerEnabled) && (
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              {isCrossContext.value && (
                <>
                  <span class="inline-flex items-center rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200">
                    已跨页面
                  </span>
                  {hasThreadForCurrentPage.value && (
                    <button
                      class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                      onClick={() =>
                        chatStore.switchToLatestConversationForCurrentContext({
                          createIfMissing: false,
                        })
                      }
                      disabled={chatStore.isLoading || isChecking.value}
                      title="切换到当前页面的对话线程"
                      aria-label="切换当前页面对话"
                    >
                      <IconSwitch size={16} aria-hidden="true" />
                    </button>
                  )}
                </>
              )}
            </div>
            {chatStore.superpowerEnabled && (
              <div class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-900">
                <button
                  class={[
                    "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
                    isAgentMode.value
                      ? "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      : "bg-indigo-600 text-white shadow-sm",
                  ].join(" ")}
                  onClick={() => chatStore.setConversationMode("chat")}
                  title="对话模式"
                  aria-label="对话模式"
                >
                  <IconChat size={16} aria-hidden="true" />
                </button>
                <button
                  class={[
                    "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
                    isAgentMode.value
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
                  ].join(" ")}
                  onClick={() => chatStore.setConversationMode("agent")}
                  title="Agent 模式"
                  aria-label="Agent 模式"
                >
                  <IconAgent size={16} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  },
})
