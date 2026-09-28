import { defineComponent } from "vue";
import { RouterLink, useRoute } from "vue-router";

const groups = [
  {
    title: "划线设置",
    items: [{ label: "划线偏好", to: "/settings/highlight/preferences" }],
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
    title: "采集",
    items: [{ label: "Inbox", to: "/settings/inbox" }],
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
      <aside class="rounded-panel border border-line bg-surface p-4 dark:border-line dark:bg-surface">
        <div class="space-y-4">
          {groups.map((group) => (
            <div key={group.title} class="space-y-2">
              <div class="text-tag font-semibold uppercase tracking-wide text-muted">
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
                        "flex items-center justify-between rounded-control px-3 py-2 text-compact font-medium transition",
                        active
                          ? "bg-surface-2 text-accent-text "
                          : "text-muted hover:bg-surface-2 dark:text-muted dark:hover:bg-surface-2",
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
