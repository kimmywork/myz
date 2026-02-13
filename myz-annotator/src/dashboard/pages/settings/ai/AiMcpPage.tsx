import { defineComponent } from "vue"
import AiMcpServersEditor from "../../../components/ai-settings/AiMcpServersEditor.jsx"
import { useAiSettingsContext } from "./aiSettingsContext.js"

export default defineComponent({
  name: "AiMcpPage",
  setup() {
    const context = useAiSettingsContext()

    return () => (
      <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/40">
        <div class="mb-3 flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-slate-900 dark:text-white">MCP 服务器</p>
          <div class="flex items-center gap-2">
            {context.mcpSaveNotice.value ? (
              <span class="text-xs text-emerald-600">
                {context.mcpSaveNotice.value}
              </span>
            ) : null}
            <button
              type="button"
              class="btn btn-primary whitespace-nowrap"
              onClick={context.saveMcpSection}
            >
              保存
            </button>
          </div>
        </div>
        <AiMcpServersEditor
          servers={context.mcpServers.value}
          onChange={(next) => (context.mcpServers.value = next)}
        />
      </div>
    )
  },
})
