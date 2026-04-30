import { AiLocalToolsSection } from "@myz/dashboard-ai-settings"
import { defineComponent } from "vue"
import { useAiSettingsContext } from "./aiSettingsContext"

export default defineComponent({
  name: "AiLocalToolsPage",
  setup() {
    const context = useAiSettingsContext()

    return () => (
      <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/40">
        <div class="mb-3 flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-slate-900 dark:text-white">
            本地 Tools
          </p>
          <div class="flex items-center gap-2">
            {context.localToolsSaveNotice.value ? (
              <span class="text-xs text-emerald-600">
                {context.localToolsSaveNotice.value}
              </span>
            ) : null}
            <button
              type="button"
              class="btn btn-primary whitespace-nowrap"
              onClick={context.saveLocalToolsSection}
            >
              保存
            </button>
          </div>
        </div>
        <AiLocalToolsSection
          providers={context.providers.value}
          value={context.localTools.value}
          onChange={(next) => {
            context.localTools.value = next
          }}
        />
      </div>
    )
  },
})
