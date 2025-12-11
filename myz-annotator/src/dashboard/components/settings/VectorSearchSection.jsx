import { defineComponent } from "vue";

export default defineComponent({
  name: "VectorSearchSection",
  props: {
    enabled: { type: Boolean, default: false },
    modelReady: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    status: { type: String, default: "" },
    onToggle: { type: Function, required: true },
    onLoad: { type: Function, required: true },
  },
  setup(props) {
    function handleToggle(event) {
      props.onToggle?.(event.target.checked);
    }

    function handleLoad() {
      props.onLoad?.();
    }

    return () => (
      <section class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm dark:border-white/10 dark:bg-slate-800/40">
        <header class="mb-3 flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-slate-900 dark:text-white">
              向量检索（Vectoria）
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              启用后可加载本地模型，对标注内容执行语义检索。
            </p>
          </div>
          <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              class="h-4 w-4 accent-sky-600"
              checked={props.enabled}
              onChange={handleToggle}
            />
            启用
          </label>
        </header>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="text-sm text-slate-600 dark:text-slate-300">
            {props.modelReady ? "模型已加载" : "模型未加载"}
            {props.status ? ` · ${props.status}` : ""}
          </div>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            disabled={!props.enabled || props.loading}
            onClick={handleLoad}
          >
            {props.loading ? "加载中…" : props.modelReady ? "重新加载模型" : "加载模型"}
          </button>
        </div>
      </section>
    );
  },
});
