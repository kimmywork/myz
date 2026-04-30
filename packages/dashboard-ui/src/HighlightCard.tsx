import { computed, defineComponent, ref } from "vue"
import type { PropType } from "vue"
import { type MyZRecord, RECORD_KINDS, getRecordKind } from "@myz/shared"
import {
  getKindLabel,
  getSocialBadgeLabel,
  getSocialKinds,
  type HighlightItemAction,
} from "./highlightMeta"

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
    const isSocial = computed(() => {
      const value = String(kind.value)
      return value.startsWith("tweet:") || value.startsWith("toot:")
    })
    const socialKinds = computed(() => getSocialKinds(props.record))
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

    const cardClasses = computed(() => {
      const classes = [
        "space-y-4 rounded-3xl border border-slate-200 bg-white/95 p-5 text-sm text-slate-800 shadow-xl transition dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100",
      ]
      if (kind.value === RECORD_KINDS.CLIP) {
        classes.push("border-teal-200 dark:border-cyan-500/30")
      }
      if (kind.value === RECORD_KINDS.AI_GENERATED) {
        classes.push("border-fuchsia-200 dark:border-fuchsia-500/40")
      }
      if (isSocial.value) {
        classes.push("border-sky-200 dark:border-sky-500/30")
      }
      return classes.join(" ")
    })

    function emitAction(action: HighlightItemAction) {
      props.onAction?.(action, props.record)
    }

    return () => (
      <article class={cardClasses.value} data-id={props.record.id} data-kind={kind.value}>
        <div class="flex items-center justify-between gap-4">
          <span
            class={[
              "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
              kind.value === RECORD_KINDS.AI_GENERATED
                ? "bg-fuchsia-500 text-white"
                : kind.value === RECORD_KINDS.CLIP
                  ? "bg-teal-500 text-white"
                  : isSocial.value
                    ? "bg-sky-500 text-white"
                    : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
            ].join(" ")}
          >
            {getKindLabel(kind.value)}
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

        {hasNote.value ? (
          <div class="grid gap-4 sm:grid-cols-2">
            <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-slate-900/70">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {getKindLabel(kind.value)}
              </h4>
              <blockquote
                class="mt-2 max-h-32 overflow-y-auto text-sm text-slate-800 break-all whitespace-pre-wrap dark:text-slate-100"
                innerHTML={props.renderHighlight(props.record)}
              ></blockquote>
            </section>
            <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-slate-900/70">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                批注
              </h4>
              <p
                class="mt-2 max-h-32 overflow-y-auto text-sm text-slate-800 break-all whitespace-pre-wrap dark:text-slate-100"
                innerHTML={props.formatNote(props.record.note || "")}
              ></p>
            </section>
          </div>
        ) : (
          <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/5 dark:bg-slate-900/70">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {getKindLabel(kind.value)}
            </h4>
            <blockquote
              class="mt-2 max-h-32 overflow-y-auto text-sm text-slate-800 break-all whitespace-pre-wrap dark:text-slate-100"
              innerHTML={props.renderHighlight(props.record)}
            ></blockquote>
          </section>
        )}

        <div class="flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
          {socialKinds.value.map((kindValue) => (
            <span
              key={`kind:${kindValue}`}
              class="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
            >
              {getSocialBadgeLabel(kindValue)}
            </span>
          ))}
          {visibleTags.value.length
            ? visibleTags.value.map((tag) => (
                <span
                  key={tag}
                  class="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 dark:border-white/10 dark:text-slate-100"
                  innerHTML={props.formatInline(tag)}
                ></span>
              ))
            : "无标签"}
          {hiddenTagsCount.value > 0 ? (
            <button
              type="button"
              class="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 hover:text-slate-700 dark:border-white/10 dark:text-slate-400 dark:hover:text-white"
              onClick={() => {
                showAllTags.value = !showAllTags.value
              }}
            >
              +{hiddenTagsCount.value} 个标签
            </button>
          ) : null}
        </div>

        <div class="mt-4 flex flex-wrap gap-3 border-t border-slate-200 pt-3 text-xs font-semibold dark:border-white/5">
          <a
            class="text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
            href={props.record.sourceUrl || props.record.url}
            target="_blank"
            rel="noopener"
            title={props.record.title || props.record.url}
          >
            页面
          </a>
          <button
            class="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            type="button"
            onClick={() => emitAction("view")}
          >
            查看
          </button>
          <button
            class="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            type="button"
            onClick={() => emitAction("edit")}
          >
            编辑
          </button>
          <button
            class="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
            type="button"
            onClick={() => emitAction("copy")}
          >
            复制
          </button>
          {kind.value === RECORD_KINDS.HIGHLIGHT ? (
            <button
              class="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              type="button"
              onClick={() => emitAction("downgrade")}
            >
              降级
            </button>
          ) : null}
          <button
            class="text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300"
            type="button"
            onClick={() => emitAction("delete")}
          >
            删除
          </button>
        </div>
      </article>
    )
  },
})
