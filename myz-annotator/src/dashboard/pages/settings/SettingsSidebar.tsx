import { defineComponent } from "vue";
import { RouterLink, useRoute } from "vue-router";

const groups = [
  {
    title: "高亮设置",
    items: [{ label: "标注偏好", to: "/settings/highlight/preferences" }],
  },
  {
    title: "外观",
    items: [{ label: "外观设置", to: "/settings/appearance" }],
  },
  {
    title: "同步",
    items: [{ label: "加密同步", to: "/settings/sync" }],
  },
  {
    title: "数据",
    items: [{ label: "导入", to: "/settings/import" }],
  },
];

export default defineComponent({
  name: "SettingsSidebar",
  setup() {
    const route = useRoute();
    const isActive = (path: string, to: string) => path === to;

    return () => (
      <aside class="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
        <div class="space-y-4">
          {groups.map((group) => (
            <div key={group.title} class="space-y-2">
              <div class="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {group.title}
              </div>
              <div class="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(route.path, item.to);
                  return (
                    <RouterLink
                      key={item.to}
                      to={item.to}
                      class={[
                        "flex items-center justify-between rounded-2xl px-3 py-2 text-sm font-medium transition",
                        active
                          ? "bg-indigo-600 text-white shadow"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60",
                      ].join(" ")}
                      aria-current={active ? "page" : undefined}
                    >
                      {item.label}
                    </RouterLink>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>
    );
  },
});
