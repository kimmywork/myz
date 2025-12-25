import { defineComponent, computed } from "vue";
import { usePageStore } from "../stores/page";
import { useUIStore } from "../stores/ui";
import { storeToRefs } from "pinia";

export default defineComponent({
  name: "InterestsPanel",
  setup() {
    const pageStore = usePageStore();
    const uiStore = useUIStore();
    const { relatedMatches } = storeToRefs(pageStore);

    const sortedRelatedMatches = computed(() =>
      relatedMatches.value
        .slice()
        .sort((a, b) => (b.score || 0) - (a.score || 0)),
    );

    const handleBackToChat = () => {
      uiStore.setView("chat");
    };

    return () => (
      <div class="flex h-full flex-col gap-3">
        <header class="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
          <div class="flex items-center gap-2">
            <h1 class="text-lg font-semibold">相关标注</h1>
            <span class="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
              {relatedMatches.value.length}
            </span>
          </div>
          <button
            class="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-300"
            onClick={handleBackToChat}
          >
            返回助手
          </button>
        </header>
        <div class="flex-1 space-y-3 overflow-auto pr-1">
          {sortedRelatedMatches.value.map((item) => (
            <div class="rounded-xl border border-slate-200 bg-white/90 p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
              <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {item.metadata?.host || item.metadata?.url || "标注"} · 相似度{" "}
                  {((item.score || 0) * 100).toFixed(1)}%
                </span>
                {item.metadata?.url ? (
                  <a
                    class="text-indigo-600 hover:underline dark:text-indigo-300"
                    href={item.metadata.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看页面
                  </a>
                ) : null}
              </div>
              <div class="mt-2 whitespace-pre-wrap text-slate-900 dark:text-slate-100">
                {item.text}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  },
});
