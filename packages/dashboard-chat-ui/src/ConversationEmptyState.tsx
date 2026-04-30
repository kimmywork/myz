import { defineComponent } from "vue"
import type { PropType } from "vue"

export default defineComponent({
  name: "ConversationEmptyState",
  props: {
    title: {
      type: String,
      default: "💬 开始与AI对话",
    },
    description: {
      type: String,
      default: "",
    },
    renderExtra: {
      type: Function as PropType<() => unknown>,
      default: null,
    },
  },
  setup(props) {
    return () => (
      <div class="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
        <p class="text-base font-medium">{props.title}</p>
        {props.description ? <p class="mt-1 text-xs">{props.description}</p> : null}
        {props.renderExtra?.()}
      </div>
    )
  },
})
