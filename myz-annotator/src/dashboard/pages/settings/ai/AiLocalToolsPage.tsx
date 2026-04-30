import { AiLocalToolsSection } from "@myz/dashboard-ai-settings";
import { defineComponent } from "vue";
import { useAiSettingsContext } from "./aiSettingsContext.js";

export default defineComponent({
  name: "AiLocalToolsPage",
  setup() {
    const context = useAiSettingsContext();

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
          requireTestedProviders
          description="本地 tools 会访问扩展内的标注数据；未启用的 tool 不会暴露给模型，也不会被执行。"
          autoDescription="（自动模式：每次发送前会用选择器模型从已启用工具中挑选本次可用的 subset）"
          selectorHint="每次发送时，会把用户输入和候选工具列表交给该模型判断本次应启用哪些工具。"
          missingAutoTargetNotice="已开启“自动”，但尚未选择选择器模型：为安全起见，本次将不会向主模型暴露任何工具。"
          value={context.localTools.value}
          onChange={(next) => (context.localTools.value = next)}
        />
      </div>
    );
  },
});
