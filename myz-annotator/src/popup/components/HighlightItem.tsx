import {
  buildMeta,
  formatNote,
  getRecordPlainText,
  normalizeWhitespace,
} from "@myz/shared/highlightUtils";
import { IconHash, IconWarning } from "@myz/shared/icons";
import { renderMarkdown } from "@myz/shared/markdownRenderer";
import { CONTENT_TYPES, resolveRecordContentType } from "@myz/shared/types";

import { MyZRecord, RECORD_KINDS, getRecordKind } from "@myz/shared/types";
import { defineComponent, computed } from "vue";
import { getRecordKindLabel } from "@/dashboard/utils/records.js";

const CLIP_COLOR = "var(--myz-clip)";

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
  setup(props: {
    record: MyZRecord;
    onAction: (action: string, record: MyZRecord) => void;
  }) {
    const kind = computed(() => getRecordKind(props.record));

    const badgeLabel = computed(() => getRecordKindLabel(props.record));

    const colorStyle = computed(() => ({
      background:
        kind.value === RECORD_KINDS.CLIP || kind.value === RECORD_KINDS.BOOKMARK
          ? CLIP_COLOR
          : props.record.color || "var(--myz-mark-1)",
    }));

    const containerClass = computed(() => {
      const base = [
        "highlight-item",
        "grid grid-cols-[3px_1fr] gap-3 rounded-control border p-4 text-compact  transition overflow-x-auto",
      ];
      if (props.record.unreachable) {
        base.push("border-error/40 bg-error-bg");
      } else if (kind.value === RECORD_KINDS.CLIP) {
        base.push("border-clip/40 bg-clip-bg");
      } else {
        base.push("border-line bg-surface/90");
      }
      return base.join(" ");
    });

    const quote = computed(() => {
      const contentType = resolveRecordContentType(props.record);
      if (contentType === CONTENT_TYPES.MARKDOWN && props.record.text) {
        const rendered = renderMarkdown(props.record.text);
        return { html: rendered, isHtml: true };
      }
      const content = getRecordPlainText(props.record);
      return { html: content || "(无正文内容)", isHtml: false };
    });

    const noteText = computed(() => formatNote(props.record.note ?? ""));

    const handleAction = (action: string) => (event: Event) => {
      event.preventDefault();
      props.onAction(action, props.record);
    };

    return () => (
      <article class={containerClass.value} data-id={props.record.id}>
        <div
          class="highlight-item__color rounded-[4px]"
          aria-hidden="true"
          style={{ background: colorStyle.value.background }}
        ></div>
        <div class="highlight-item__content flex flex-col gap-2">
          <div class="highlight-item__header flex flex-wrap items-center gap-2">
            <span
              class={[
                "highlight-item__badge inline-flex h-[22px] items-center rounded-tag px-2 text-tag font-semibold uppercase tracking-wide",
                kind.value === RECORD_KINDS.CLIP
                  ? "bg-clip-bg text-clip"
                  : "bg-tag-bg text-tag-fg",
              ].join(" ")}
            >
              {badgeLabel.value}
            </span>
            {props.record.unreachable ? (
              <span class="highlight-item__status inline-flex h-[22px] items-center gap-1 rounded-full bg-error-bg px-2 text-tag font-semibold text-error dark:bg-error/20 dark:text-error">
                <span class="highlight-item__status-icon" aria-hidden="true">
                  <IconWarning size={12} aria-hidden="true" />
                </span>
                <span class="highlight-item__status-text">划线找不到原文</span>
              </span>
            ) : null}
          </div>
          {quote.value.isHtml ? (
            <div
              class="highlight-item__quote font-read text-compact text-text prose prose-sm dark:prose-invert"
              innerHTML={quote.value.html}
            />
          ) : (
            <p
              class="highlight-item__quote font-read text-compact text-text"
              title={quote.value.html}
            >
              {quote.value.html}
            </p>
          )}
          {noteText.value ? (
            <p
              class="highlight-item__note font-read text-compact text-text"
              title={normalizeWhitespace(props.record.note ?? "")}
            >
              {noteText.value}
            </p>
          ) : null}
          <p class="highlight-item__meta text-tag text-muted">
            {buildMeta(props.record)}
          </p>
          {props.record.tags?.length ? (
            <div class="highlight-item__tags flex flex-wrap gap-2">
              {props.record.tags.map((tag) => (
                <span
                  key={tag}
                  class="inline-flex h-[22px] items-center gap-1 rounded-tag bg-tag-bg px-2 text-tag font-semibold text-tag-fg"
                >
                  <IconHash size={12} aria-hidden="true" />
                  <span>{tag}</span>
                </span>
              ))}
            </div>
          ) : null}
          <div class="highlight-item__actions mt-1 flex flex-wrap gap-3 text-caption font-semibold">
            {kind.value === RECORD_KINDS.HIGHLIGHT ? (
              <button
                class="btn-link text-accent-text hover:underline dark:text-accent-text"
                data-action="focus"
                onClick={handleAction("focus")}
              >
                打开原文
              </button>
            ) : null}
            {props.record.unreachable &&
            kind.value === RECORD_KINDS.HIGHLIGHT ? (
              <button
                class="btn-link btn-link--muted text-muted hover:text-text dark:text-muted dark:hover:text-text"
                data-action="downgrade"
                onClick={handleAction("downgrade")}
              >
                降级为摘录
              </button>
            ) : null}
            <button
              class="btn-link text-muted hover:text-text dark:text-muted dark:hover:text-text"
              data-action="copy"
              onClick={handleAction("copy")}
            >
              复制
            </button>
            <button
              class="btn-link btn-link--danger text-error hover:text-error dark:text-error"
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
