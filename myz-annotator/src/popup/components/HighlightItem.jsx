import { defineComponent, computed } from "vue";
import {
  buildMeta,
  formatNote,
  getRecordPlainText,
  normalizeWhitespace,
} from "../../shared/highlightUtils.js";

import { RECORD_KINDS } from "../../dashboard/utils/records.js";
import { IconWarning } from "../../shared/icons.js";

const CLIP_COLOR = "rgba(45, 212, 191, 0.5)";

export default defineComponent({
  name: "HighlightItem",
  props: {
    record: {
      type: Object,
      required: true,
    },
    onAction: {
      type: Function,
      required: true,
    },
  },
  setup(props) {
    const kind = computed(() =>
      props.record.kind === RECORD_KINDS.CLIP
        ? RECORD_KINDS.CLIP
        : RECORD_KINDS.HIGHLIGHT,
    );

    const badgeLabel = computed(() =>
      kind.value === RECORD_KINDS.CLIP ? "保存文字" : "划线标注",
    );

    const colorStyle = computed(() => ({
      background:
        kind.value === RECORD_KINDS.CLIP
          ? CLIP_COLOR
          : props.record.color || "#ffe58f",
    }));

    const containerClass = computed(() => {
      const base = [
        "highlight-item",
        "grid grid-cols-[4px_1fr] gap-3 rounded-2xl border p-4 text-sm shadow-sm transition",
      ];
      if (props.record.unreachable) {
        base.push(
          "border-rose-200/70 bg-rose-50/80 dark:border-rose-500/40 dark:bg-rose-500/10",
        );
      } else if (kind.value === RECORD_KINDS.CLIP) {
        base.push(
          "border-teal-200/70 bg-teal-50/70 dark:border-teal-400/40 dark:bg-teal-500/10",
        );
      } else {
        base.push(
          "border-slate-200 bg-white/90 dark:border-slate-700 dark:bg-slate-900/60",
        );
      }
      return base.join(" ");
    });

    const quote = computed(() => {
      const content = getRecordPlainText(props.record);
      return content || "(无正文内容)";
    });

    const noteText = computed(() => formatNote(props.record.note));

    const handleAction = (action) => (event) => {
      event.preventDefault();
      props.onAction(action, props.record);
    };

    return () => (
      <article class={containerClass.value} data-id={props.record.id}>
        <div
          class="highlight-item__color rounded-full"
          aria-hidden="true"
          style={{ background: colorStyle.value.background }}
        ></div>
        <div class="highlight-item__content flex flex-col gap-2">
          <div class="highlight-item__header flex flex-wrap items-center gap-2">
            <span
              class={[
                "highlight-item__badge inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
                kind.value === RECORD_KINDS.CLIP
                  ? "bg-teal-500 text-white"
                  : "bg-amber-200 text-amber-900 dark:bg-amber-400/30 dark:text-amber-100",
              ].join(" ")}
            >
              {badgeLabel.value}
            </span>
            {props.record.unreachable ? (
              <span class="highlight-item__status inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-600 dark:bg-rose-500/20 dark:text-rose-200">
                <span class="highlight-item__status-icon" aria-hidden="true">
                  <IconWarning size={12} aria-hidden="true" />
                </span>
                <span class="highlight-item__status-text">标注无法定位</span>
              </span>
            ) : null}
          </div>
          <p
            class="highlight-item__quote text-sm text-slate-700 dark:text-slate-100"
            title={quote.value}
          >
            {quote.value}
          </p>
          {noteText.value ? (
            <p
              class="highlight-item__note text-sm text-amber-600 dark:text-amber-300"
              title={normalizeWhitespace(props.record.note)}
            >
              {noteText.value}
            </p>
          ) : null}
          <p class="highlight-item__meta text-xs text-slate-500 dark:text-slate-400">
            {buildMeta(props.record)}
          </p>
          <div class="highlight-item__actions mt-1 flex flex-wrap gap-3 text-xs font-semibold">
            {kind.value === RECORD_KINDS.HIGHLIGHT ? (
              <button
                class="btn-link text-indigo-600 hover:underline dark:text-indigo-300"
                data-action="focus"
                onClick={handleAction("focus")}
              >
                定位
              </button>
            ) : null}
            {props.record.unreachable &&
            kind.value === RECORD_KINDS.HIGHLIGHT ? (
              <button
                class="btn-link btn-link--muted text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white"
                data-action="downgrade"
                onClick={handleAction("downgrade")}
              >
                降级为保存
              </button>
            ) : null}
            <button
              class="btn-link text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white"
              data-action="copy"
              onClick={handleAction("copy")}
            >
              复制
            </button>
            <button
              class="btn-link btn-link--danger text-rose-500 hover:text-rose-700 dark:text-rose-300 dark:hover:text-rose-200"
              data-action="delete"
              onClick={handleAction("delete")}
            >
              删除
            </button>
          </div>
        </div>
      </article>
    );
  },
});
