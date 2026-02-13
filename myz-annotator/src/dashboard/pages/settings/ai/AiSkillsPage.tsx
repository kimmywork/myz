import { defineComponent } from "vue"
import AiSkillsSection from "../../../components/ai-settings/AiSkillsSection.jsx"
import { useAiSettingsContext } from "./aiSettingsContext.js"

export default defineComponent({
  name: "AiSkillsPage",
  setup() {
    const context = useAiSettingsContext()

    return () => (
      <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/40">
        <div class="mb-3 flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-slate-900 dark:text-white">Agent Skills</p>
          <div class="flex items-center gap-2">
            {context.skillsSaveNotice.value ? (
              <span class="text-xs text-emerald-600">
                {context.skillsSaveNotice.value}
              </span>
            ) : null}
            <button
              type="button"
              class="btn btn-primary whitespace-nowrap"
              onClick={context.saveSkillsSection}
            >
              保存
            </button>
          </div>
        </div>
        <AiSkillsSection
          providers={context.providers.value}
          value={context.skillsSettings.value}
          onChange={(next) => (context.skillsSettings.value = next)}
        />
      </div>
    )
  },
})
