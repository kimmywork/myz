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

    const containerClass = computed(() => ({
      "highlight-item": true,
      "highlight-item--clip": kind.value === RECORD_KINDS.CLIP,
      "highlight-item--unreachable": Boolean(props.record.unreachable),
    }));

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
        <div class="highlight-item__color" style={colorStyle.value}></div>
        <div class="highlight-item__content">
          <div class="highlight-item__header">
            <span class="highlight-item__badge">{badgeLabel.value}</span>
            {props.record.unreachable ? (
              <div
                class="highlight-item__status"
                aria-hidden="false"
                title="标注无法定位"
              >
                <span class="highlight-item__status-icon" aria-hidden="true">
                  <IconWarning size={12} aria-hidden="true" />
                </span>
                <span class="highlight-item__status-text">
                  标注无法定位，页面可能已改变
                </span>
              </div>
            ) : null}
          </div>
          <p class="highlight-item__quote" title={quote.value}>
            {quote.value}
          </p>
          {noteText.value ? (
            <p
              class="highlight-item__note"
              title={normalizeWhitespace(props.record.note)}
            >
              {noteText.value}
            </p>
          ) : null}
          <p class="highlight-item__meta">{buildMeta(props.record)}</p>
          <div class="highlight-item__actions">
            {kind.value === RECORD_KINDS.HIGHLIGHT ? (
              <button
                class="btn-link"
                data-action="focus"
                onClick={handleAction("focus")}
              >
                定位
              </button>
            ) : null}
            {props.record.unreachable &&
            kind.value === RECORD_KINDS.HIGHLIGHT ? (
              <button
                class="btn-link btn-link--muted"
                data-action="downgrade"
                onClick={handleAction("downgrade")}
              >
                降级为保存
              </button>
            ) : null}
            <button
              class="btn-link"
              data-action="copy"
              onClick={handleAction("copy")}
            >
              复制
            </button>
            <button
              class="btn-link btn-link--danger"
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
