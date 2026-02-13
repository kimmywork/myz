import { defineComponent } from "vue"
import AiAgentRouting from "../../../components/ai-settings/AiAgentRouting.jsx"
import { useAiSettingsContext } from "./aiSettingsContext.js"

export default defineComponent({
  name: "AiAgentsPage",
  setup() {
    const context = useAiSettingsContext()

    return () => (
      <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/40">
        <div class="mb-3 flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-slate-900 dark:text-white">Agent 模型选择</p>
          <div class="flex items-center gap-2">
            {context.agentSaveNotice.value ? (
              <span class="text-xs text-emerald-600">
                {context.agentSaveNotice.value}
              </span>
            ) : null}
            <button
              type="button"
              class="btn btn-primary whitespace-nowrap"
              onClick={context.saveAgentsSection}
            >
              保存
            </button>
          </div>
        </div>
        <AiAgentRouting
          providers={context.providers.value}
          agents={context.agents.value}
          onChange={(next) => (context.agents.value = next)}
        />
      </div>
    )
  },
})
