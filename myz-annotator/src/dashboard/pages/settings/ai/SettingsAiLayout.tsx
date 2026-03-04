import { computed, defineComponent, provide, watch } from "vue";
import { RouterView, useRoute, useRouter } from "vue-router";
import ToggleSwitch from "../../../components/ToggleSwitch.jsx";
import { aiSettingsKey, createAiSettingsContext } from "./aiSettingsContext.js";

export default defineComponent({
  name: "SettingsAiLayout",
  setup() {
    const context = createAiSettingsContext();
    provide(aiSettingsKey, context);
    const route = useRoute();
    const router = useRouter();
    const canEnableAssistant = computed(() => context.hasEnabledProvider.value);

    watch(
      [() => context.aiAssistantEnabled.value, () => route.path],
      ([enabled, path]) => {
        if (!enabled && !path.startsWith("/settings/ai/providers")) {
          router.replace("/settings/ai/providers");
        }
      },
      { immediate: true },
    );

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>AI Assistant</h3>
          <div class="flex items-center gap-3">
            <span class="text-sm text-slate-700 dark:text-slate-200">
              启用智能助理
            </span>
            <ToggleSwitch
              checked={context.aiAssistantEnabled.value}
              disabled={!canEnableAssistant.value}
              ariaLabel="启用智能助理"
              onChange={(e) =>
                (context.aiAssistantEnabled.value = (
                  e.target as HTMLInputElement
                ).checked)
              }
            />
          </div>
        </div>
        <p class="settings__hint">
          {canEnableAssistant.value
            ? "配置 Provider / Agent / MCP，并分别保存。"
            : "请先启用至少一个可用的 Provider 才能开启智能助理。"}
        </p>
        <div class="mt-4">
          <RouterView />
        </div>
      </section>
    );
  },
});
