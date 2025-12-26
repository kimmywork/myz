import { defineComponent } from "vue";
import { useUIStore } from "../stores/ui.js";
import AiSettings from "./AiSettings.jsx";
import ImportHighlightsSection from "./settings/ImportHighlightsSection.jsx";
import SocialImportSection from "./settings/SocialImportSection.jsx";
import VectorSearchSection from "./settings/VectorSearchSection.jsx";

export default defineComponent({
  name: "SettingsPane",
  setup() {
    const uiStore = useUIStore();

    function handleCloseSettings() {
      uiStore.showHighlights();
    }

    return () => (
      <section
        id="settings-view"
        class={[
          "rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-2xl transition dark:border-white/10 dark:bg-slate-900/60",
        ].join(" ")}
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
          <button class="btn-link" type="button" onClick={handleCloseSettings}>
            返回标注
          </button>
        </header>

        <div class="mt-4 space-y-4">
          <ImportHighlightsSection />
          <SocialImportSection />
          <AiSettings />
          <VectorSearchSection />
        </div>
      </section>
    );
  },
});
