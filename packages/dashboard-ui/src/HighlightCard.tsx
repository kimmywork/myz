import { type MyZRecord, RECORD_KINDS, getRecordKind } from "@myz/shared"
import { computed, defineComponent, ref } from "vue"
import type { PropType } from "vue"
import {
  Bookmark,
  Copy,
  ExternalLink,
  Eye,
  FilePenLine,
  FileText,
  Hash,
  Highlighter,
  RefreshCw,
  Trash2,
} from "@lucide/vue"
import {
  getKindLabel,
  type HighlightItemAction,
} from "./highlightMeta"

const KIND_ICON: Record<string, typeof Bookmark> = {
  [RECORD_KINDS.BOOKMARK]: Bookmark,
  [RECORD_KINDS.HIGHLIGHT]: Highlighter,
  [RECORD_KINDS.CLIP]: FileText,
}

export default defineComponent({
  name: "HighlightCard",
  props: {
    record: {
      type: Object as PropType<MyZRecord>,
      required: true,
    },
    formatInline: {
      type: Function as PropType<(value: string) => string>,
      required: true,
    },
    formatDateTime: {
      type: Function as PropType<(value: string) => string>,
      required: true,
    },
    renderHighlight: {
      type: Function as PropType<(record: MyZRecord) => string>,
      required: true,
    },
    formatNote: {
      type: Function as PropType<(value: string) => string>,
      required: true,
    },
    onAction: Function as PropType<(action: HighlightItemAction, record: MyZRecord) => void>,
  },
  setup(props) {
    const kind = computed(() => getRecordKind(props.record))
    const hasNote = computed(() => Boolean(props.record.note))
    const tags = computed(() => props.record.tags || [])
    const showAllTags = ref(false)
    const maxVisibleTags = 5

    const visibleTags = computed(() =>
      showAllTags.value ? tags.value : tags.value.slice(0, maxVisibleTags),
    )
    const hiddenTagsCount = computed(() =>
      Math.max(0, tags.value.length - maxVisibleTags),
    )

    const KindIcon = KIND_ICON[kind.value] || Highlighter

    const cardClasses = computed(() => {
      const classes = [
        "flex h-full flex-col rounded-3xl border border-slate-200 bg-white/95 p-4 text-sm text-slate-800 shadow-xl transition dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100",
      ]
      if (kind.value === RECORD_KINDS.CLIP) {
        classes.push("border-teal-200 dark:border-cyan-500/30")
      }
      return classes.join(" ")
    })

    function emitAction(action: HighlightItemAction) {
      props.onAction?.(action, props.record)
    }

    return () => (
      <article class={`${cardClasses.value} break-inside-avoid`} data-id={props.record.id} data-kind={kind.value}>
        <div class="flex items-center justify-between gap-4">
          <span
            class={[
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
              kind.value === RECORD_KINDS.CLIP
                ? "bg-teal-500 text-white"
                : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
            ].join(" ")}
          >
            <KindIcon size={14} />
          </span>
          <div class="flex flex-col items-end text-xs text-slate-400">
            <span
              class="max-w-[120px] truncate text-slate-500 dark:text-slate-300"
              title={props.record.hostname || props.record.url || ""}
              innerHTML={props.formatInline(
                `${(props.record.hostname || props.record.url || "").substring(0, 20)}${
                  (props.record.hostname || props.record.url || "").length > 20
                    ? "..."
                    : ""
                }`,
              )}
            ></span>
            <span class="text-slate-400 dark:text-slate-500">
              {props.formatDateTime(props.record.createdAt)}
            </span>
          </div>
        </div>

        <div class="mt-3 flex-1 overflow-y-auto">
          {hasNote.value ? (
            <div class="grid gap-4">
              <section class="max-h-[20lh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-slate-900/70">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {getKindLabel(kind.value)}
                </h4>
                <div
                  class="mt-2 prose dark:prose-invert prose-sm max-w-none text-sm text-slate-800 dark:text-slate-100"
                  innerHTML={props.renderHighlight(props.record)}
                ></div>
              </section>
              <section class="max-h-[20lh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-slate-900/70">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  批注
                </h4>
                <div
                  class="mt-2 prose dark:prose-invert prose-sm max-w-none text-sm text-slate-600 dark:text-slate-200"
                  innerHTML={props.formatNote(props.record.note || "")}
                ></div>
              </section>
            </div>
          ) : (
            <section class="max-h-[20lh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-slate-900/70">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {getKindLabel(kind.value)}
              </h4>
              <div
                class="mt-2 prose dark:prose-invert prose-sm max-w-none text-sm text-slate-800 dark:text-slate-100"
                innerHTML={props.renderHighlight(props.record)}
              ></div>
            </section>
          )}
        </div>

        <div class="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {visibleTags.value.length
            ? visibleTags.value.map((tag) => (
                <span
                  key={tag}
                  class="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-700 dark:border-white/10 dark:text-slate-100"
                >
                  <Hash size={12} />
                  <span innerHTML={props.formatInline(tag)} />
                </span>
              ))
            : "无标签"}
          {hiddenTagsCount.value > 0 ? (
            <button
              type="button"
              class="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-700 dark:border-white/10 dark:text-slate-400 dark:hover:text-white"
              onClick={() => {
                showAllTags.value = !showAllTags.value
              }}
            >
              +{hiddenTagsCount.value}
            </button>
          ) : null}
        </div>

        <div class="mt-4 flex items-center gap-1 border-t border-slate-200 pt-3 text-xs font-semibold dark:border-white/5">
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
          {kind.value === RECORD_KINDS.HIGHLIGHT ? (
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
      </article>
    )
  },
})
