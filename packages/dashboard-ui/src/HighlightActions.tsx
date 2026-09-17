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
      <div class="flex items-center gap-1 border-t border-line pt-3 text-caption font-semibold dark:border-line">
        {externalHref.value ? (
          <a
            class="rounded-tag p-1.5 text-accent-text hover:text-accent-text dark:text-accent-text dark:hover:text-accent-text"
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
            class="rounded-tag p-1.5 text-warn hover:text-warn dark:text-warn dark:hover:text-warn"
            type="button"
            onClick={() => emitAction("openPdf")}
            title="在阅读器中打开"
          >
            <BookOpen size={16} />
          </button>
        ) : null}
        <button
          class="rounded-tag p-1.5 text-muted hover:text-text dark:text-muted dark:hover:text-text"
          type="button"
          onClick={() => emitAction("view")}
          title="打开原文"
        >
          <Eye size={16} />
        </button>
        <button
          class="rounded-tag p-1.5 text-muted hover:text-text dark:text-muted dark:hover:text-text"
          type="button"
          onClick={() => emitAction("edit")}
          title="编辑"
        >
          <FilePenLine size={16} />
        </button>
        <button
          class="rounded-tag p-1.5 text-muted hover:text-text dark:text-muted dark:hover:text-text"
          type="button"
          onClick={() => emitAction("copy")}
          title="复制"
        >
          <Copy size={16} />
        </button>
        {props.kind === RECORD_KINDS.HIGHLIGHT ? (
          <button
            class="rounded-tag p-1.5 text-muted hover:text-text dark:text-muted dark:hover:text-text"
            type="button"
            onClick={() => emitAction("downgrade")}
            title="降级"
          >
            <RefreshCw size={16} />
          </button>
        ) : null}
        <button
          class="rounded-tag p-1.5 text-error hover:text-error dark:text-error dark:hover:text-error"
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
