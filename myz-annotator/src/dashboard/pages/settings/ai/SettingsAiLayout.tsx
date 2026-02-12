import { defineComponent, provide } from "vue"
import { RouterView } from "vue-router"
import { aiSettingsKey, createAiSettingsContext } from "./aiSettingsContext.js"
import ToggleSwitch from "../../../components/ToggleSwitch.jsx"

export default defineComponent({
  name: "SettingsAiLayout",
  setup() {
    const context = createAiSettingsContext()
    provide(aiSettingsKey, context)

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>AI Assistant</h3>
          <div class="flex items-center gap-3">
            <span class="text-sm text-slate-700 dark:text-slate-200">启用智能助理</span>
            <ToggleSwitch
              checked={context.aiAssistantEnabled.value}
              ariaLabel="启用智能助理"
              onChange={(e) =>
                (context.aiAssistantEnabled.value = (
                  e.target as HTMLInputElement
                ).checked)
              }
            />
          </div>
        </div>
        <p class="settings__hint">配置 Provider / Agent / MCP，并分别保存。</p>
        <div class="mt-4">
          <RouterView />
        </div>
      </section>
    )
  },
})
