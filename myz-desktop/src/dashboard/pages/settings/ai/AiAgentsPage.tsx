import { defineComponent } from "vue";
import { AiAgentsPanel } from "@myz/dashboard-ai-settings";
import { useAiSettingsContext } from "./aiSettingsContext";

export default defineComponent({
  name: "AiAgentsPage",
  setup() {
    const context = useAiSettingsContext();

    return () => (
      <AiAgentsPanel
        providers={context.providers.value}
        agents={context.agents.value}
        saveNotice={context.agentSaveNotice.value}
        visibleAgents={["conversation"]}
        providerFilterMode="enabled"
        onChange={(next) => {
          context.agents.value = next;
        }}
        onSave={context.saveAgentsSection}
        renderAfter={() => (
          <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/40">
            <div class="mb-3">
              <p class="text-sm font-medium text-slate-900 dark:text-white">
                Desktop Agent Persona
              </p>
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                这里的角色设定只作用于 desktop chat，不影响 annotator 端。
              </p>
            </div>
            <div class="grid gap-3">
              <label class="field">
                <span>默认工作区</span>
                <input
                  value={
                    context.workspaceContext.value?.workspaceRoot || "加载中…"
                  }
                  readonly
                />
              </label>
              <div class="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-500 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-400">
                所有本地 Agent 操作都必须限制在{" "}
                <code>
                  {context.workspaceContext.value?.scopeLabel || "workspace"}
                </code>{" "}
                内。首次进入时会在该目录创建 <code>AGENTS.md</code>
                作为默认上下文约束。
              </div>
              <label class="field">
                <span>角色名称</span>
                <input
                  value={context.desktopAgent.value.personaName}
                  onInput={(event) => {
                    context.desktopAgent.value = {
                      ...context.desktopAgent.value,
                      personaName: (event.target as HTMLInputElement).value,
                    };
                  }}
                />
              </label>
              <label class="field">
                <span>角色说明</span>
                <textarea
                  rows={5}
                  value={context.desktopAgent.value.rolePrompt}
                  onInput={(event) => {
                    context.desktopAgent.value = {
                      ...context.desktopAgent.value,
                      rolePrompt: (event.target as HTMLTextAreaElement).value,
                    };
                  }}
                />
              </label>
            </div>
          </div>
        )}
      />
    );
  },
});
