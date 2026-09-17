import { defineComponent } from "vue";
import { RouterLink, RouterView } from "vue-router";
import SettingsSidebar from "./SettingsSidebar.jsx";

export default defineComponent({
  name: "SettingsLayout",
  setup() {
    return () => (
      <section
        id="settings-view"
        class="rounded-panel border border-line bg-surface/95 p-5 shadow-float transition dark:border-line dark:bg-surface"
        aria-labelledby="settings-title"
      >
        <header class="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-line">
          <div>
            <h2
              id="settings-title"
              class="text-heading font-semibold text-text"
            >
              设置
            </h2>
            <p class="text-compact text-muted">配置选项</p>
          </div>
          <RouterLink class="btn-link" to="/highlights">
            返回文库
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
    );
  },
});
