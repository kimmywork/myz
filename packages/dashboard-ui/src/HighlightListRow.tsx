import { type MyZRecord, RECORD_KINDS, getRecordKind } from "@myz/shared"
import { computed, defineComponent, ref } from "vue"
import type { PropType } from "vue"
import {
  getKindLabel,
  getSocialBadgeLabel,
  getSocialKinds,
  type HighlightItemAction,
} from "./highlightMeta"

export default defineComponent({
  name: "HighlightListRow",
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
    const showAllTags = ref(false)
    const tags = computed(() => props.record.tags || [])
    const maxVisibleTags = 5
    const visibleTags = computed(() =>
      showAllTags.value ? tags.value : tags.value.slice(0, maxVisibleTags),
    )
    const hiddenTagsCount = computed(() =>
      Math.max(0, tags.value.length - maxVisibleTags),
    )

    function emitAction(action: HighlightItemAction) {
      props.onAction?.(action, props.record)
    }

    return () => (
      <div
        class={[
          "rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm text-slate-800 shadow-sm dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100",
          kind.value === RECORD_KINDS.CLIP ? "border-teal-200 dark:border-cyan-500/30" : "",
          kind.value === RECORD_KINDS.AI_GENERATED
            ? "border-fuchsia-200 dark:border-fuchsia-500/40"
            : "",
          isSocial.value ? "border-sky-200 dark:border-sky-500/30" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div class="mb-4 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span
            class={[
              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
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
          <span
            class="max-w-[120px] truncate font-semibold text-slate-600 dark:text-slate-200"
            title={props.record.hostname || props.record.url || ""}
            innerHTML={props.formatInline(
              `${(props.record.hostname || props.record.url || "").substring(0, 20)}${
                (props.record.hostname || props.record.url || "").length > 20 ? "..." : ""
              }`,
            )}
          ></span>
          <span class="text-slate-400 dark:text-slate-500">
            {props.formatDateTime(props.record.createdAt)}
          </span>
        </div>

        {(socialKinds.value.length > 0 || visibleTags.value.length > 0) ? (
          <div class="mb-4 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
            {socialKinds.value.map((kindValue) => (
              <span
                key={`kind:${kindValue}`}
                class="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
              >
                {getSocialBadgeLabel(kindValue)}
              </span>
            ))}
            {visibleTags.value.map((tag) => (
              <span
                key={tag}
                class="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-700 dark:border-white/10 dark:text-slate-100"
                innerHTML={props.formatInline(tag)}
              ></span>
            ))}
            {hiddenTagsCount.value > 0 ? (
              <button
                type="button"
                class="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-700 dark:border-white/10 dark:text-slate-400 dark:hover:text-white"
                onClick={() => {
                  showAllTags.value = !showAllTags.value
                }}
              >
                +{hiddenTagsCount.value} 个标签
              </button>
            ) : null}
          </div>
        ) : null}

        <div class="grid grid-cols-[1fr_auto] gap-6">
          <div class="min-h-0">
            {props.record.note ? (
              <div class="grid gap-4 md:grid-cols-2">
                <div
                  class="max-h-32 overflow-y-auto break-all rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap dark:border-white/5 dark:bg-slate-900/70"
                  innerHTML={props.renderHighlight(props.record)}
                ></div>
                <div
                  class="max-h-32 overflow-y-auto break-all rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 whitespace-pre-wrap dark:border-white/5 dark:bg-slate-900/70 dark:text-slate-200"
                  innerHTML={props.formatNote(props.record.note)}
                ></div>
              </div>
            ) : (
              <div
                class="max-h-32 overflow-y-auto break-all rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap dark:border-white/5 dark:bg-slate-900/70"
                innerHTML={props.renderHighlight(props.record)}
              ></div>
            )}
          </div>
          <div class="flex flex-col gap-2 text-xs font-semibold">
            <a
              class="whitespace-nowrap text-indigo-600 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200"
              href={props.record.sourceUrl || props.record.url}
              target="_blank"
              rel="noopener"
              title={props.record.title || props.record.url}
            >
              页面
            </a>
            <button
              class="whitespace-nowrap text-left text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              type="button"
              onClick={() => emitAction("view")}
            >
              查看
            </button>
            <button
              class="whitespace-nowrap text-left text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              type="button"
              onClick={() => emitAction("edit")}
            >
              编辑
            </button>
            <button
              class="whitespace-nowrap text-left text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
              type="button"
              onClick={() => emitAction("copy")}
            >
              复制
            </button>
            {kind.value === RECORD_KINDS.HIGHLIGHT ? (
              <button
                class="whitespace-nowrap text-left text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                type="button"
                onClick={() => emitAction("downgrade")}
              >
                降级
              </button>
            ) : null}
            <button
              class="whitespace-nowrap text-left text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300"
              type="button"
              onClick={() => emitAction("delete")}
            >
              删除
            </button>
          </div>
        </div>
      </div>
    )
  },
})
