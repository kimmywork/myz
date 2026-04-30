import { computed, defineComponent, ref, watch } from "vue";
import type { PropType } from "vue";
import ToggleSwitch from "./ToggleSwitch";
import { createModelSetting } from "./factories";
import type { AIModelSetting } from "./types";

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export default defineComponent({
  name: "AiModelListEditor",
  props: {
    models: { type: Array as PropType<AIModelSetting[]>, required: true },
    catalog: { type: Array as PropType<string[]>, default: () => [] },
    isRefreshingCatalog: { type: Boolean, default: false },
    catalogStatusMessage: { type: String, default: "" },
    onRefreshCatalog: { type: Function as PropType<() => void>, default: null },
    onChange: {
      type: Function as PropType<(models: AIModelSetting[]) => void>,
      required: true,
    },
  },
  setup(props) {
    const manualModel = ref("");
    const listFilter = ref("");
    const selectedName = ref("");
    const pendingSelection = ref("");

    const modelByName = computed(() => {
      const map = new Map<string, AIModelSetting>();
      props.models.forEach((model) => {
        const key = (model.model || "").trim();
        if (!key) return;
        map.set(key, model);
      });
      return map;
    });

    const catalogNames = computed(() => {
      const raw = Array.isArray(props.catalog) ? props.catalog : [];
      return raw
        .filter((name) => typeof name === "string" && name.trim().length > 0)
        .map((name) => name.trim());
    });

    const mergedNames = computed(() => {
      const allNames = new Set<string>();
      catalogNames.value.forEach((name) => allNames.add(name));
      props.models.forEach((model) => {
        const name = model.model.trim();
        if (name) allNames.add(name);
      });
      const query = listFilter.value.trim().toLowerCase();
      return [...allNames]
        .filter((name) => (query ? name.toLowerCase().includes(query) : true))
        .sort((a, b) => a.localeCompare(b));
    });

    const selectedModel = computed(() => {
      const name = selectedName.value.trim();
      if (!name) return null;
      return modelByName.value.get(name) || null;
    });

    watch(
      () => mergedNames.value,
      (items) => {
        if (pendingSelection.value) {
          const next = pendingSelection.value;
          pendingSelection.value = "";
          if (items.includes(next)) {
            selectedName.value = next;
            return;
          }
        }
        if (selectedName.value && items.includes(selectedName.value)) {
          return;
        }
        selectedName.value = items[0] || "";
      },
      { immediate: true },
    );

    function addModel(modelName: string) {
      const trimmed = modelName.trim();
      if (!trimmed) {
        return;
      }
      if (modelByName.value.has(trimmed)) {
        selectedName.value = trimmed;
        manualModel.value = "";
        return;
      }
      props.onChange([...props.models, createModelSetting(trimmed)]);
      manualModel.value = "";
      selectedName.value = trimmed;
    }

    function removeModel(id: string) {
      props.onChange(props.models.filter((model) => model.id !== id));
    }

    function updateModel(id: string, patch: Partial<AIModelSetting>) {
      props.onChange(
        props.models.map((model) =>
          model.id === id ? ({ ...model, ...patch } as AIModelSetting) : model,
        ),
      );
    }

    function updateCapabilities(
      id: string,
      patch: Partial<AIModelSetting["capabilities"]>,
    ) {
      props.onChange(
        props.models.map((model) =>
          model.id === id
            ? {
                ...model,
                capabilities: { ...model.capabilities, ...patch },
              }
            : model,
        ),
      );
    }

    function updateLimits(
      id: string,
      patch: Partial<AIModelSetting["limits"]>,
    ) {
      props.onChange(
        props.models.map((model) =>
          model.id === id
            ? {
                ...model,
                limits: { ...model.limits, ...patch },
              }
            : model,
        ),
      );
    }

    return () => (
      <div class="space-y-3">
        <div class="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">
            模型列表
          </div>
          {props.catalogStatusMessage ? (
            <div class="text-xs text-slate-500 dark:text-slate-400">
              {props.catalogStatusMessage}
            </div>
          ) : null}
          <div class="flex items-center gap-2">
            {props.onRefreshCatalog ? (
              <button
                type="button"
                class="btn btn-small px-2"
                aria-label="刷新模型列表"
                title="刷新 /models"
                disabled={props.isRefreshingCatalog}
                onClick={() => props.onRefreshCatalog?.()}
              >
                <svg
                  class={[
                    "h-4 w-4",
                    props.isRefreshingCatalog ? "animate-spin" : "",
                  ].join(" ")}
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M20 12a8 8 0 1 1-2.343-5.657"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <path
                    d="M20 4v6h-6"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            ) : null}
            <input
              class="input"
              type="text"
              value={manualModel.value}
              placeholder="手动添加模型，例如 gpt-4o-mini"
              onInput={(event) => {
                manualModel.value = (event.target as HTMLInputElement).value;
              }}
            />
            <button
              type="button"
              class="btn btn-small btn-primary whitespace-nowrap text-white"
              onClick={() => addModel(manualModel.value)}
            >
              添加模型
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-3 md:flex-row md:items-stretch">
          <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900/60">
            <input
              class="input mb-3"
              type="text"
              value={listFilter.value}
              placeholder="筛选模型名称…"
              onInput={(event) => {
                listFilter.value = (event.target as HTMLInputElement).value;
              }}
            />
            <div class="space-y-2">
              {mergedNames.value.length ? (
                mergedNames.value.map((name) => {
                  const model = modelByName.value.get(name);
                  return (
                    <button
                      key={model?.id || name}
                      type="button"
                      class={[
                        "w-full rounded-xl border px-3 py-2 text-left transition",
                        selectedName.value === name
                          ? "border-indigo-400 bg-indigo-50 dark:border-indigo-400/60 dark:bg-indigo-500/10"
                          : "border-slate-200 hover:border-indigo-300 dark:border-white/10 dark:hover:border-indigo-400/40",
                      ].join(" ")}
                      onClick={() => {
                        if (!model) {
                          addModel(name);
                        }
                        selectedName.value = name;
                      }}
                    >
                      <div class="flex items-center justify-between gap-2">
                        <span class="truncate font-medium text-slate-900 dark:text-white">
                          {name}
                        </span>
                        <span
                          class={[
                            "settings__pill",
                            model?.enabled
                              ? "settings__pill--success"
                              : "settings__pill--info",
                          ].join(" ")}
                        >
                          {model
                            ? model.enabled
                              ? "enabled"
                              : "disabled"
                            : "catalog"}
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p class="text-sm text-slate-500">暂无模型</p>
              )}
            </div>
          </div>

          <div class="flex-1">
            {selectedModel.value ? (
              (() => {
                const selected = selectedModel.value!;
                return (
                  <div class="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/60">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div class="text-sm font-semibold text-slate-900 dark:text-white">
                          {selected.model}
                        </div>
                        <div class="text-xs text-slate-500 dark:text-slate-400">
                          调整模型能力、token 限额与工具策略
                        </div>
                      </div>
                      <div class="flex items-center gap-3">
                        <span class="text-sm text-slate-700 dark:text-slate-200">
                          启用
                        </span>
                        <ToggleSwitch
                          checked={selected.enabled}
                          ariaLabel="启用模型"
                          onChange={(event: Event) =>
                            updateModel(selected.id, {
                              enabled: (event.target as HTMLInputElement)
                                .checked,
                            })
                          }
                        />
                        <button
                          type="button"
                          class="btn btn-small"
                          onClick={() => removeModel(selected.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    <div class="grid gap-3 sm:grid-cols-2">
                      <label class="field">
                        <span>Context Window</span>
                        <input
                          type="number"
                          min="1024"
                          value={selected.limits.contextWindow}
                          onInput={(event) =>
                            updateLimits(selected.id, {
                              contextWindow: clampNumber(
                                (event.target as HTMLInputElement).value,
                                1024,
                                10_000_000,
                                selected.limits.contextWindow,
                              ),
                            })
                          }
                        />
                      </label>
                      <label class="field">
                        <span>Max Output Tokens</span>
                        <input
                          type="number"
                          min="1"
                          value={selected.limits.maxOutputTokens}
                          onInput={(event) =>
                            updateLimits(selected.id, {
                              maxOutputTokens: clampNumber(
                                (event.target as HTMLInputElement).value,
                                1,
                                1_000_000,
                                selected.limits.maxOutputTokens,
                              ),
                            })
                          }
                        />
                      </label>
                    </div>

                    <div class="grid gap-3 sm:grid-cols-2">
                      <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={selected.capabilities.vision}
                          onChange={(event) =>
                            updateCapabilities(selected.id, {
                              vision: (event.target as HTMLInputElement)
                                .checked,
                            })
                          }
                        />
                        <span>Vision</span>
                      </label>
                      <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={selected.capabilities.reasoning}
                          onChange={(event) =>
                            updateCapabilities(selected.id, {
                              reasoning: (event.target as HTMLInputElement)
                                .checked,
                            })
                          }
                        />
                        <span>Reasoning</span>
                      </label>
                      <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={selected.capabilities.toolCalling}
                          onChange={(event) =>
                            updateCapabilities(selected.id, {
                              toolCalling: (event.target as HTMLInputElement)
                                .checked,
                            })
                          }
                        />
                        <span>Tool Calling</span>
                      </label>
                      <label class="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={selected.systemPromptInUserMessage || false}
                          onChange={(event) =>
                            updateModel(selected.id, {
                              systemPromptInUserMessage: (
                                event.target as HTMLInputElement
                              ).checked,
                            })
                          }
                        />
                        <span>System Prompt In User Message</span>
                      </label>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div class="settings__empty">请选择模型</div>
            )}
          </div>
        </div>
      </div>
    );
  },
});
