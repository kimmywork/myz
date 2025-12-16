import { defineComponent } from "vue";
import { useDashboardStore } from "../store/useDashboardStore.js";
import ThemeToggle from "@/shared/components/ThemeToggle.jsx";

export default defineComponent({
  name: "DashboardNavbar",
  setup() {
    const store = useDashboardStore();
    const tabs = [
      { key: "highlights", label: "标注列表" },
      { key: "settings", label: "设置" },
    ];

    function handleTabClick(key: string) {
      if (key === "settings") {
        store.showSettings();
      } else {
        store.showHighlights();
      }
    }

    return () => (
      <nav class="flex flex-wrap items-center gap-4 rounded-3xl border border-slate-200 bg-white/80 px-6 py-4 text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:text-white">
        <div class="text-lg font-semibold">MyZ 标注</div>
        <div class="flex flex-1 flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const active = store.panel.value === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                class={[
                  "rounded-full px-4 py-1.5 text-sm font-semibold transition",
                  active
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white",
                ].join(" ")}
                aria-label={tab.key === "settings" ? "打开设置" : undefined}
                aria-pressed={active ? "true" : "false"}
                onClick={() => handleTabClick(tab.key)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div class="ml-auto flex items-center">
          <ThemeToggle variant="switch" aria-label="切换日夜模式" />
        </div>
      </nav>
    );
  },
});
