import { computed, defineComponent } from "vue";
import { useUIStore } from "../stores/ui.js";
import { formatDateTime } from "@/dashboard/utils/records.js";

export default defineComponent({
  name: "PageSidebar",
  setup() {
    const uiStore = useUIStore();
    const isFixedHeight = computed(() => Boolean(uiStore.pageSidebarOpen));
    const sidebarClasses = computed(() => {
      const classes = [
        "w-full max-w-xs rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-xl dark:border-white/10 dark:bg-slate-900/60",
      ];
      if (isFixedHeight.value) {
        classes.push(
          "flex h-[calc(100vh-160px)] min-h-0 flex-col overflow-hidden",
        );
      }
      return classes.join(" ");
    });
    const listClasses = computed(() => {
      const classes = ["mt-3 flex min-h-0 flex-col gap-2"];
      return classes.join(" ");
    });
    const groupsClasses = computed(() => {
      const classes = ["space-y-2"];
      if (isFixedHeight.value) {
        classes.push("flex-1 overflow-y-auto pr-1");
      }
      return classes.join(" ");
    });

    return () => (
      <aside class={sidebarClasses.value}>
        <header class="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-white/10">
          <div>
            <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-100">
              页面列表
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              按最近添加排序
            </p>
          </div>
          <button
            type="button"
            class="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:text-slate-700 dark:border-white/10 dark:text-slate-300 dark:hover:text-white"
            onClick={uiStore.togglePageSidebar}
          >
            收起
          </button>
        </header>

        <div class={listClasses.value}>
          <button
            type="button"
            class={[
              "w-full rounded-2xl border px-3 py-2 text-left text-sm transition",
              uiStore.pageFilter
                ? "border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 dark:text-slate-300 dark:hover:text-indigo-200"
                : "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-indigo-200",
            ].join(" ")}
            onClick={uiStore.clearPageFilter}
          >
            全部页面
          </button>

          {uiStore.pageGroups.length ? (
            <div class={groupsClasses.value}>
              {uiStore.pageGroups.map((group) => {
                const title = group.title || group.hostname || group.url;
                const isActive = uiStore.pageFilter === group.url;
                return (
                  <button
                    key={group.url}
                    type="button"
                    class={[
                      "w-full rounded-2xl border px-3 py-3 text-left transition",
                      isActive
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-400/40 dark:bg-indigo-500/10 dark:text-indigo-200"
                        : "border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 dark:text-slate-300 dark:hover:text-indigo-200",
                    ].join(" ")}
                    onClick={() => uiStore.setPageFilter(group.url)}
                  >
                    <div class="flex items-center justify-between gap-3">
                      <span
                        class="line-clamp-2 text-sm font-semibold"
                        title={title}
                      >
                        {title}
                      </span>
                      <span class="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-300">
                        {group.count}
                      </span>
                    </div>
                    <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      {group.hostname || group.url}
                    </p>
                    <p class="mt-1 text-xs text-slate-400 dark:text-slate-500">
                      最近添加：{formatDateTime(group.latestAt)}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <p class="text-xs text-slate-400 dark:text-slate-500">
              暂无可用页面
            </p>
          )}
        </div>
      </aside>
    );
  },
});
