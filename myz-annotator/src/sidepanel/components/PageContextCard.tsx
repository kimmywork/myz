import { defineComponent } from "vue";
import { usePageStore } from "../stores/page";
import { useChatStore } from "../stores/chat";
import { storeToRefs } from "pinia";

export default defineComponent({
  name: "PageContextCard",
  setup() {
    const pageStore = usePageStore();
    const chatStore = useChatStore();
    const { pageTitle, currentUrl } = storeToRefs(pageStore);
    const { sendContext, isLoading } = storeToRefs(chatStore);

    const toggleContext = (e: Event) => {
      const target = e.target as HTMLInputElement;
      sendContext.value = target.checked;
    };

    return () => (
      <section class="mt-4 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/60">
        <div class="text-base font-semibold text-slate-900 dark:text-white">
          {pageTitle.value || "当前页面"}
        </div>
        <div class="mt-1 truncate text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {currentUrl.value || "未获取页面地址"}
        </div>
        <label class="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <div>
            <p class="font-semibold text-slate-800 dark:text-slate-50">
              发送页面上下文
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              控制是否附带页面内容
            </p>
          </div>
          <input
            type="checkbox"
            class="h-5 w-5 rounded border-slate-300 text-indigo-500 focus:ring-indigo-500 dark:border-slate-600"
            checked={sendContext.value}
            disabled={isLoading.value}
            onChange={toggleContext}
          />
        </label>
      </section>
    );
  },
});
