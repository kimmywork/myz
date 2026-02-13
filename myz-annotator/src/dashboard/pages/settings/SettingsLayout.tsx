import { defineComponent } from "vue"
import { RouterLink, RouterView } from "vue-router"
import SettingsSidebar from "./SettingsSidebar.jsx"

export default defineComponent({
  name: "SettingsLayout",
  setup() {
    return () => (
      <section
        id="settings-view"
        class="rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-2xl transition dark:border-white/10 dark:bg-slate-900/60"
        aria-labelledby="settings-title"
      >
        <header class="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/5">
          <div>
            <h2
              id="settings-title"
              class="text-xl font-semibold text-slate-900 dark:text-white"
            >
              设置
            </h2>
            <p class="text-sm text-slate-500 dark:text-slate-400">配置选项</p>
          </div>
          <RouterLink class="btn-link" to="/highlights">
            返回标注
          </RouterLink>
        </header>

        <div class="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
          <div class="w-full lg:w-60 lg:shrink-0">
            <SettingsSidebar />
          </div>
          <div class="min-w-0 flex-1">
            <RouterView />
          </div>
        </div>
      </section>
    )
  },
})
