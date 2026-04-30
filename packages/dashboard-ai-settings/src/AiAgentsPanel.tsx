import { defineComponent } from "vue"
import type { PropType } from "vue"
import AiAgentRouting from "./AiAgentRouting"
import type { AIAgentsSettings, AIProviderSetting } from "./types"

export default defineComponent({
  name: "AiAgentsPanel",
  props: {
    title: { type: String, default: "Agent 模型选择" },
    saveNotice: { type: String, default: "" },
    providers: { type: Array as PropType<AIProviderSetting[]>, required: true },
    agents: { type: Object as PropType<AIAgentsSettings>, required: true },
    visibleAgents: {
      type: Array as PropType<Array<keyof AIAgentsSettings>>,
      default: null,
    },
    providerFilterMode: {
      type: String as PropType<"enabled" | "enabled_tested">,
      default: "enabled_tested",
    },
    onChange: {
      type: Function as PropType<(next: AIAgentsSettings) => void>,
      required: true,
    },
    onSave: { type: Function as PropType<() => void>, required: true },
    renderAfter: {
      type: Function as PropType<() => unknown>,
      default: null,
    },
  },
  setup(props) {
    return () => (
      <div class="space-y-4">
        <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/40">
          <div class="mb-3 flex items-center justify-between gap-2">
            <p class="text-sm font-medium text-slate-900 dark:text-white">
              {props.title}
            </p>
            <div class="flex items-center gap-2">
              {props.saveNotice ? (
                <span class="text-xs text-emerald-600">{props.saveNotice}</span>
              ) : null}
              <button
                type="button"
                class="btn btn-primary whitespace-nowrap"
                onClick={props.onSave}
              >
                保存
              </button>
            </div>
          </div>
          <AiAgentRouting
            providers={props.providers}
            agents={props.agents}
            visibleAgents={props.visibleAgents || undefined}
            providerFilterMode={props.providerFilterMode}
            onChange={props.onChange}
          />
        </div>
        {props.renderAfter?.()}
      </div>
    )
  },
})
