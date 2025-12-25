import { computed, defineComponent, Ref, ref, watch } from "vue";
import { useSettingsStore } from "../../stores/settings.js";
import { VectorSettings } from "@/background/settings";

export type EmbeddingProviderType = "local" | "openai";

export default defineComponent({
  name: "VectorSearchSection",
  setup() {
    const store = useSettingsStore();
    const providerType: Ref<EmbeddingProviderType> = ref(
      store.settings.vectorUseLocalModel ? "local" : "openai",
    );
    const maxChars = ref(store.settings.vectorMaxChars || 500);
    const endpoint = ref(store.settings.vectorOpenAiEndpoint || "");
    const apiKey = ref(store.settings.vectorOpenAiApiKey || "");
    const model = ref(
      store.settings.vectorOpenAiModel || "text-embedding-3-small",
    );
    const testPassed = ref(false);
    const modelReady = computed(() => {
      return providerType.value === "openai"
        ? testPassed.value || Boolean(store.settings.vectorSearchEnabled)
        : Boolean(store.settings.vectorModelReady);
    });

    watch(
      () => store.settings,
      (next) => {
        providerType.value = next?.vectorUseLocalModel ? "local" : "openai";
        maxChars.value = next?.vectorMaxChars || 500;
        endpoint.value = next?.vectorOpenAiEndpoint || "";
        apiKey.value = next?.vectorOpenAiApiKey || "";
        model.value = next?.vectorOpenAiModel || "text-embedding-3-small";
      },
      { deep: true },
    );

    function buildPayload(type: EmbeddingProviderType = providerType.value): VectorSettings {
      return {
        vectorSearchEnabled: Boolean(store.settings.vectorSearchEnabled),
        vectorUseLocalModel: type === "local",
        vectorMaxChars: Number(maxChars.value) || 500,
        vectorOpenAiEndpoint: endpoint.value.trim(),
        vectorOpenAiApiKey: apiKey.value.trim(),
        vectorOpenAiModel: model.value.trim() || "text-embedding-3-small",
        vectorModelReady:
          providerType.value === "openai"
            ? testPassed.value && Boolean(store.settings.vectorSearchEnabled)
            : modelReady.value,
      };
    }

    function handleToggleEnable(event: Event) {
      store.toggleVectorSearch((event.target as HTMLInputElement).checked);
    }

    async function handleLoadLocal() {
      await store.loadVectorModel();
    }

    async function handleRebuild() {
      await store.rebuildVectorIndex();
    }

    async function handleTestOpenAi() {
      const payload = buildPayload("openai");
      const result = await store.testVectorProvider(payload);
      if (result?.success) {
        testPassed.value = true;
      }
    }

    async function handleSave() {
      const payload = buildPayload();
      await store.saveSettings(payload);
    }

    async function handleSwitch(type: EmbeddingProviderType) {
      providerType.value = type;
      testPassed.value = false;
      const payload = buildPayload(type);
      await store.switchVectorProvider(payload);
    }

    return () => (
      <section class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/40">
        <header class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm font-medium text-slate-900 dark:text-white">
              向量检索（Vectoria）
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              选择本地模型或 OpenAI 兼容模型，并重建索引。
            </p>
          </div>
          <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              class="h-4 w-4 accent-sky-600"
              checked={store.settings.vectorSearchEnabled}
              onChange={handleToggleEnable}
            />
            启用
          </label>
        </header>

        <div class="mb-3 flex gap-2">
          <button
            type="button"
            class={`flex-1 rounded-full border px-3 py-2 text-sm ${providerType.value === "local" ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/40 dark:text-indigo-100" : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}
            onClick={() => handleSwitch("local")}
          >
            浏览器本地模型
          </button>
          <button
            type="button"
            class={`flex-1 rounded-full border px-3 py-2 text-sm ${providerType.value === "openai" ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/40 dark:text-indigo-100" : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}
            onClick={() => handleSwitch("openai")}
          >
            OpenAI 兼容
          </button>
        </div>

        {providerType.value === "local" ? (
          <div class="space-y-3">
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-primary btn-sm"
                disabled={!store.settings.vectorSearchEnabled || store.vectorModelLoading}
                onClick={handleLoadLocal}
              >
                {store.vectorModelLoading
                  ? "加载中…"
                  : store.settings.vectorModelReady
                    ? "重新加载模型"
                    : "加载模型"}
              </button>
              <button
                type="button"
                class="btn btn-outline btn-sm"
                disabled={!store.settings.vectorSearchEnabled}
                onClick={handleSave}
              >
                保存设置
              </button>
            </div>
          </div>
        ) : (
          <div class="space-y-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="text-sm text-slate-700 dark:text-slate-200">
                接口地址
                <input
                  type="text"
                  class="input mt-1 w-full"
                  placeholder="https://api.openai.com/v1"
                  value={endpoint.value}
                  onInput={(e: InputEvent) => {
                    endpoint.value = (e.target as HTMLInputElement).value;
                    testPassed.value = false;
                  }}
                />
              </label>
              <label class="text-sm text-slate-700 dark:text-slate-200">
                模型名称
                <input
                  type="text"
                  class="input mt-1 w-full"
                  placeholder="text-embedding-3-small"
                  value={model.value}
                  onInput={(e: InputEvent) => {
                    model.value = (e.target as HTMLInputElement).value;
                    testPassed.value = false;
                  }}
                />
              </label>
            </div>
            <label class="text-sm text-slate-700 dark:text-slate-200">
              API Key
              <input
                type="password"
                class="input mt-1 w-full"
                value={apiKey.value}
                onInput={(e: InputEvent) => {
                  apiKey.value = (e.target as HTMLInputElement).value;
                  testPassed.value = false;
                }}
              />
            </label>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                disabled={!store.settings.vectorSearchEnabled || store.vectorModelLoading}
                onClick={handleTestOpenAi}
              >
                测试连接
              </button>
              <button
                type="button"
                class="btn btn-outline btn-sm"
                disabled={!store.settings.vectorSearchEnabled}
                onClick={handleSave}
              >
                保存设置
              </button>
            </div>
          </div>
        )}
        <div class="mt-4 space-y-3 rounded-xl border border-slate-200/80 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/60">
          <div class="grid gap-3 sm:grid-cols-2 sm:items-center">
            <label class="text-sm text-slate-700 dark:text-slate-200">
              索引切片最大字符数
              <input
                type="number"
                min="50"
                class="input mt-1 w-full"
                value={maxChars.value}
                onInput={(e: InputEvent) => {
                  maxChars.value =
                    Number((e.target as HTMLInputElement).value) || 500;
                  testPassed.value = false;
                }}
              />
            </label>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                disabled={!store.settings.vectorSearchEnabled || store.vectorModelLoading}
                onClick={handleRebuild}
              >
                重建索引
              </button>
              <button
                type="button"
                class="btn btn-outline btn-sm"
                disabled={!store.settings.vectorSearchEnabled}
                onClick={handleSave}
              >
                保存设置
              </button>
            </div>
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400">
            {modelReady.value
              ? "模型已准备就绪"
              : "模型未加载或未测试"}
            {store.vectorModelStatus ? ` · ${store.vectorModelStatus}` : ""}
          </div>
        </div>
      </section>
    );
  },
});
