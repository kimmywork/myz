import { computed, defineComponent } from "vue"
import { RouterLink, useRoute } from "vue-router"
import { desktopDashboardHost } from "../../../host/desktop"
import { useSettingsStore } from "../../stores/settings"

const groups = [
  {
    title: "高亮设置",
    items: [{ label: "标注偏好", to: "/settings/highlight/preferences" }],
  },
  {
    title: "数据导入",
    items: [
      { label: "导入标注", to: "/settings/import" },
      ...(desktopDashboardHost.features.socialImport
        ? [{ label: "社区导入", to: "/settings/social" }]
        : []),
    ],
  },
  {
    title: "同步",
    items: [{ label: "桌面同步", to: "/settings/sync" }],
  },
]

const aiItems = [
  { label: "Provider / Models", to: "/settings/ai/providers" },
  { label: "Agent 路由", to: "/settings/ai/agents" },
  { label: "MCP 服务器", to: "/settings/ai/mcp" },
  { label: "本地 Tools", to: "/settings/ai/tools" },
  { label: "Skills", to: "/settings/ai/skills" },
  { label: "Vector Search", to: "/settings/ai/vector" },
]

export default defineComponent({
  name: "SettingsSidebar",
  setup() {
    const route = useRoute()
    const settingsStore = useSettingsStore()

    const visibleAiItems = computed(() =>
      settingsStore.settings.aiAssistantEnabled
        ? aiItems
        : aiItems.filter((item) => item.to === "/settings/ai/providers"),
    )

    function isActive(to: string) {
      return route.path === to
    }

    return () => (
      <aside class="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
        <div class="space-y-4">
          {groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
            <div key={group.title} class="space-y-2">
              <div class="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {group.title}
              </div>
              <div class="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(item.to)
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
                    >
                      {item.label}
                    </RouterLink>
                  )
                })}
              </div>
            </div>
          ))}

          <div class="space-y-2">
            <div class="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              AI 助理
            </div>
            <div class="space-y-1 border-l border-slate-200 pl-3 dark:border-slate-700">
              {visibleAiItems.value.map((item) => {
                const active = isActive(item.to)
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
                  >
                    {item.label}
                  </RouterLink>
                )
              })}
            </div>
          </div>
        </div>
      </aside>
    )
  },
})
