import { AiVectorSearchSection } from "@myz/dashboard-ai-settings"
import { defineComponent } from "vue"
import { useAiSettingsContext } from "./aiSettingsContext"

export default defineComponent({
  name: "AiVectorSearchPage",
  setup() {
    const context = useAiSettingsContext()

    return () => (
      <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/40">
        <div class="mb-3 flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-slate-900 dark:text-white">
            向量检索
          </p>
          <div class="flex items-center gap-2">
            {context.vectorTestNotice.value ? (
              <span class="text-xs text-slate-500 dark:text-slate-400">
                {context.vectorTestNotice.value}
              </span>
            ) : null}
            {context.vectorSaveNotice.value ? (
              <span class="text-xs text-emerald-600">
                {context.vectorSaveNotice.value}
              </span>
            ) : null}
            <button
              type="button"
              class="btn btn-primary whitespace-nowrap"
              onClick={context.saveVectorSection}
            >
              保存
            </button>
          </div>
        </div>
        <AiVectorSearchSection
          providers={context.providers.value}
          value={context.vectorSettings.value}
          isTesting={context.isVectorTesting.value}
          targetSummary={context.vectorTargetSummary.value}
          onTestConnection={context.runVectorConnectionTest}
          onChange={(next) => {
            context.vectorSettings.value = next
          }}
        />
      </div>
    )
  },
})
