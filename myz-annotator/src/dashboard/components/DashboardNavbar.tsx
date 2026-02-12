import { computed, defineComponent } from "vue";
import { RouterLink, useRoute } from "vue-router";
import ThemeToggle from "@/shared/components/ThemeToggle.jsx";

export default defineComponent({
  name: "DashboardNavbar",
  setup() {
    const route = useRoute();
    const tabs = [
      {
        key: "highlights",
        label: "标注列表",
        to: "/highlights",
        isActive: (path: string) => path.startsWith("/highlights"),
      },
      {
        key: "settings",
        label: "设置",
        to: "/settings",
        isActive: (path: string) => path.startsWith("/settings"),
      },
    ];
    const activeKey = computed(() => {
      const path = route.path || "";
      return tabs.find((tab) => tab.isActive(path))?.key ?? "highlights";
    });

    return () => (
      <nav class="flex flex-wrap items-center gap-4 rounded-3xl border border-slate-200 bg-white/80 px-6 py-4 text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-900/70 dark:text-white">
        <div class="text-lg font-semibold">MyZ 智能助理</div>
        <div class="flex flex-1 flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const active = activeKey.value === tab.key;
            return (
              <RouterLink
                key={tab.key}
                to={tab.to}
                class={[
                  "rounded-full px-4 py-1.5 text-sm font-semibold transition",
                  active
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white",
                ].join(" ")}
                aria-label={tab.key === "settings" ? "打开设置" : undefined}
                aria-current={active ? "page" : undefined}
              >
                {tab.label}
              </RouterLink>
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
