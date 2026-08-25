import { defineComponent } from "vue"
import type { PropType } from "vue"
import {
  Copy,
  ExternalLink,
  Eye,
  FilePenLine,
  RefreshCw,
  Trash2,
} from "@lucide/vue"
import type { MyZRecord } from "@myz/shared"
import { RECORD_KINDS } from "@myz/shared"
import type { HighlightItemAction } from "./highlightMeta"

export default defineComponent({
  name: "HighlightActions",
  props: {
    record: {
      type: Object as PropType<MyZRecord>,
      required: true,
    },
    kind: {
      type: String,
      required: true,
    },
    onAction: Function as PropType<(action: HighlightItemAction, record: MyZRecord) => void>,
  },
  setup(props) {
    function emitAction(action: HighlightItemAction) {
      props.onAction?.(action, props.record)
    }

    return () => (
      <div class="flex items-center gap-1 border-t border-slate-200 pt-3 text-xs font-semibold dark:border-white/5">
        <a
          class="rounded-md p-1.5 text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
          href={props.record.sourceUrl || props.record.url}
          target="_blank"
          rel="noopener"
          title={props.record.title || props.record.url}
        >
          <ExternalLink size={16} />
        </a>
        <button
          class="rounded-md p-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          type="button"
          onClick={() => emitAction("view")}
          title="查看"
        >
          <Eye size={16} />
        </button>
        <button
          class="rounded-md p-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          type="button"
          onClick={() => emitAction("edit")}
          title="编辑"
        >
          <FilePenLine size={16} />
        </button>
        <button
          class="rounded-md p-1.5 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
          type="button"
          onClick={() => emitAction("copy")}
          title="复制"
        >
          <Copy size={16} />
        </button>
        {props.kind === RECORD_KINDS.HIGHLIGHT ? (
          <button
            class="rounded-md p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            type="button"
            onClick={() => emitAction("downgrade")}
            title="降级"
          >
            <RefreshCw size={16} />
          </button>
        ) : null}
        <button
          class="rounded-md p-1.5 text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300"
          type="button"
          onClick={() => emitAction("delete")}
          title="删除"
        >
          <Trash2 size={16} />
        </button>
      </div>
    )
  },
})
