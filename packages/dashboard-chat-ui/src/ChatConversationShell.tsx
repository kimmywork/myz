import { defineComponent } from "vue"
import type { PropType } from "vue"

export default defineComponent({
  name: "ChatConversationShell",
  props: {
    renderHeader: {
      type: Function as PropType<() => unknown>,
      required: true,
    },
    renderNotices: {
      type: Function as PropType<() => unknown>,
      default: null,
    },
    renderList: {
      type: Function as PropType<() => unknown>,
      required: true,
    },
    renderComposer: {
      type: Function as PropType<() => unknown>,
      default: null,
    },
  },
  setup(props) {
    return () => (
      <section class="flex max-h-[calc(100vh-160px)] min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
        {props.renderHeader()}
        {props.renderNotices?.()}
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          {props.renderList()}
          {props.renderComposer?.()}
        </div>
      </section>
    )
  },
})
