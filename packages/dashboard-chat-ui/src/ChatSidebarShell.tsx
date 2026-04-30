import { defineComponent } from "vue"
import type { PropType } from "vue"

export default defineComponent({
  name: "ChatSidebarShell",
  props: {
    title: { type: String, default: "对话历史" },
    description: { type: String, default: "" },
    buttonLabel: { type: String, default: "新对话" },
    buttonDisabled: { type: Boolean, default: false },
    onCreate: {
      type: Function as PropType<() => void>,
      required: true,
    },
    renderBody: {
      type: Function as PropType<() => unknown>,
      required: true,
    },
    renderDescriptionExtra: {
      type: Function as PropType<() => unknown>,
      default: null,
    },
  },
  setup(props) {
    return () => (
      <aside class="flex h-[calc(100vh-160px)] min-h-0 w-full flex-col gap-4 overflow-hidden rounded-3xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 lg:w-[320px] lg:shrink-0">
        <header class="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
          <div>
            <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {props.title}
            </h2>
            {props.description ? (
              <p class="text-xs text-slate-500 dark:text-slate-400">
                {props.description}
              </p>
            ) : null}
            {props.renderDescriptionExtra?.()}
          </div>
          <button
            class="inline-flex items-center rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-200"
            onClick={props.onCreate}
            disabled={props.buttonDisabled}
          >
            {props.buttonLabel}
          </button>
        </header>
        {props.renderBody()}
      </aside>
    )
  },
})
