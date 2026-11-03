import { ShieldCheck, TriangleAlert } from "@lucide/vue";
import { SelectInput, SettingsRow } from "@myz/dashboard-ui";
import type { SelectOption } from "@myz/dashboard-ui";
import { defineComponent, computed, ref, watchEffect } from "vue";
import { Notice } from "../../components/setup/primitives.jsx";
import ToggleSwitch from "../../components/ToggleSwitch.jsx";
import { useSettingsStore } from "../../stores/settings.js";
import {
  AI_PROMPT_TEMPLATE_MAX_LENGTH,
  DEFAULT_AI_PROMPT_TEMPLATE,
  renderAiPrompt,
} from "@/ai/prompt";
import { AI_PROVIDER_IDS, AI_PROVIDERS, getAiProvider } from "@/ai/providers";
import { normalizeAiSettings } from "@/ai/settings";

/** Sample excerpt/URL used by the live preview. */
const SAMPLE_TEXT = "选中一段文字后，这里会显示最终发送给 AI 的内容。";
const SAMPLE_URL = "https://example.com/article";

/**
 * Settings for the toolbar's 解读 action: switch, provider and prompt template.
 * The template uses `{TEXT}` / `{URL}` placeholders and is previewed live, since
 * the exact wording is what reaches the model.
 */
export default defineComponent({
  name: "SettingsAiPage",
  setup() {
    const store = useSettingsStore();
    const enabled = ref(true);
    const provider = ref("deepseek");
    const template = ref(DEFAULT_AI_PROMPT_TEMPLATE);
    const savedAt = ref(0);

    watchEffect(() => {
      const ai = normalizeAiSettings(store.settings.ai);
      enabled.value = ai.enabled;
      provider.value = ai.provider;
      template.value = ai.promptTemplate;
    });

    // Providers that are registered but not wired up yet stay visible, greyed
    // out, so the roadmap is discoverable without being selectable.
    const providerOptions = computed<SelectOption[]>(() =>
      AI_PROVIDER_IDS.map((id) => {
        const entry = AI_PROVIDERS[id];
        return {
          value: id,
          label: entry.available ? entry.label : `${entry.label}（即将支持）`,
          disabled: !entry.available,
        };
      }),
    );

    const preview = computed(() =>
      renderAiPrompt({
        template: template.value,
        text: SAMPLE_TEXT,
        url: SAMPLE_URL,
      }),
    );

    const hasPlaceholder = computed(
      () =>
        /\{\s*text\s*\}/i.test(template.value) ||
        /\{\s*url\s*\}/i.test(template.value),
    );

    async function save(patch: {
      enabled?: boolean;
      provider?: string;
      promptTemplate?: string;
    }) {
      const next = normalizeAiSettings({
        ...normalizeAiSettings(store.settings.ai),
        ...patch,
      });
      enabled.value = next.enabled;
      provider.value = next.provider;
      template.value = next.promptTemplate;
      await store.saveSettings({ ai: next });
      savedAt.value = Date.now();
    }

    return () => (
      <section class="space-y-5">
        <div>
          <h3 class="text-title font-semibold text-text">AI 解读</h3>
          <p class="text-compact text-muted">
            在网页上选中内容后，用一个按钮把它送到外部 AI 对话里。只填入输入框，
            不会自动发送。
          </p>
        </div>

        <Notice tone="warn" icon={TriangleAlert}>
          <div class="space-y-1">
            <p class="font-semibold">启用前请慎重评估</p>
            <p>
              「AI 解读」由<strong>第三方服务</strong>（如 DeepSeek、Qwen
              的网页版）提供。启用后，你选中的文字和所在网页地址会被发送到该第三方站点；
              选区包含图片时，还会附带选区范围的截图。这些内容会存入你那边的对话历史。
            </p>
            <p>
              我们无法控制第三方的数据处理方式 ——
              对方可能收集、留存或泄露这些数据，并适用其自身的服务条款与隐私政策。请只在了解风险、
              且内容不敏感时启用。默认为关闭。
            </p>
          </div>
        </Notice>

        <Notice tone="info" icon={ShieldCheck}>
          <div class="space-y-1">
            <p class="font-semibold">MyZ 免责声明</p>
            <p>
              MyZ 自身<strong>不提供任何线上服务</strong>，也
              <strong>不收集任何用户数据</strong>。
              本功能只在你已登录的浏览器里，把内容填入第三方站点的输入框；我们不中转、不存储、
              不分析这些内容，也没有任何服务器参与。是否发送、发送给谁，完全由你决定。
            </p>
          </div>
        </Notice>

        <SettingsRow
          label="启用「解读」按钮"
          hint="默认关闭；关闭后网页采集条不再显示该按钮"
          controlWidth="auto"
        >
          <ToggleSwitch
            checked={enabled.value}
            ariaLabel="启用解读按钮"
            onChange={(event: Event) =>
              void save({ enabled: (event.target as HTMLInputElement).checked })
            }
          />
        </SettingsRow>

        <SettingsRow
          label="AI 服务"
          hint={`发送到 ${getAiProvider(provider.value).origin}`}
          controlWidth="field"
        >
          <SelectInput
            modelValue={provider.value}
            options={providerOptions.value}
            ariaLabel="AI 服务"
            onChange={(next) => void save({ provider: next })}
          />
        </SettingsRow>

        <SettingsRow
          label="提示词模板"
          hint={`用 {TEXT} 插入选中文本、{URL} 插入网页地址；留空恢复默认（最多 ${AI_PROMPT_TEMPLATE_MAX_LENGTH} 字符）`}
          stacked
        >
          <div class="field">
            <textarea
              rows={6}
              value={template.value}
              maxlength={AI_PROMPT_TEMPLATE_MAX_LENGTH}
              onChange={(event: Event) =>
                void save({
                  promptTemplate: (event.target as HTMLTextAreaElement).value,
                })
              }
            />
            <div class="flex flex-wrap items-center gap-2">
              <button
                class="btn btn-small"
                type="button"
                onClick={() =>
                  void save({ promptTemplate: DEFAULT_AI_PROMPT_TEMPLATE })
                }
              >
                恢复默认
              </button>
              {hasPlaceholder.value ? null : (
                <span class="text-caption text-muted">
                  模板里没有占位符，文本和网址会追加在末尾
                </span>
              )}
            </div>
          </div>
        </SettingsRow>

        <SettingsRow label="发送内容预览" stacked>
          <pre class="max-h-64 overflow-auto whitespace-pre-wrap rounded-control border border-line bg-surface-2 p-3 text-caption text-text">
            {preview.value}
          </pre>
        </SettingsRow>

        <p class="text-caption text-muted">
          {savedAt.value
            ? "修改即保存。"
            : "修改即保存；新设置对之后加载的网页生效。"}
        </p>
      </section>
    );
  },
});
