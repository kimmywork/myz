import {
  BookOpen,
  Copy,
  ExternalLink,
  Eye,
  FilePenLine,
  RefreshCw,
  Trash2,
} from "@lucide/vue"
import type { MyZRecord } from "@myz/shared"
import { RECORD_KINDS } from "@myz/shared"
import { isPdfSourceUrl } from "@myz/shared/url"
import type { PropType } from "vue"
import { computed, defineComponent } from "vue"
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

    const isPdf = computed(() => Boolean(props.record.pdfLocator))
    const externalHref = computed(() =>
      props.record.sourceUrl && !isPdfSourceUrl(props.record.sourceUrl)
        ? props.record.sourceUrl
        : !isPdfSourceUrl(props.record.url)
          ? props.record.url
          : undefined,
    )

    return () => (
      <div class="flex items-center gap-1 border-t border-slate-200 pt-3 text-xs font-semibold dark:border-white/5">
        {externalHref.value ? (
          <a
            class="rounded-md p-1.5 text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
            href={externalHref.value}
            target="_blank"
            rel="noopener"
            title={props.record.title || props.record.url}
          >
            <ExternalLink size={16} />
          </a>
        ) : null}
        {isPdf.value ? (
          <button
            class="rounded-md p-1.5 text-amber-600 hover:text-amber-500 dark:text-amber-300 dark:hover:text-amber-200"
            type="button"
            onClick={() => emitAction("openPdf")}
            title="在阅读器中打开"
          >
            <BookOpen size={16} />
          </button>
        ) : null}
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
