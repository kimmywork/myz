import { DEFAULT_COLOR, RECORD_KINDS, type MyZRecord } from "@myz/shared/types";
import { defineComponent, type PropType } from "vue";

/**
 * One highlight/clip row in a reader sidebar list. Callers pre-format the
 * display text (PDF truncates with `excerpt`, EPUB shows it whole) and decide
 * whether the trailing tags are shown.
 */
export default defineComponent({
  name: "ReaderHighlightRow",
  props: {
    record: { type: Object as PropType<MyZRecord>, required: true },
    /** Display text for the row (already truncated if desired). */
    text: { type: String, required: true },
    /** Note body without the「批注：」prefix. */
    note: { type: String, default: "" },
    /** Small label above the text, e.g.「第 2 章」. */
    chapter: { type: String, default: "" },
    active: { type: Boolean, default: false },
    showTags: { type: Boolean, default: false },
    onSelect: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    return () => (
      <button
        type="button"
        class={"reader-hl__item" + (props.active ? " is-active" : "")}
        onClick={props.onSelect}
      >
        <span
          class="reader-hl__mark"
          data-kind={props.record.kind}
          style={{
            background:
              props.record.kind === RECORD_KINDS.CLIP
                ? "transparent"
                : props.record.color || DEFAULT_COLOR,
          }}
        />
        <span class="reader-hl__body">
          {props.chapter ? (
            <span class="reader-hl__chapter">{props.chapter}</span>
          ) : null}
          <span class="reader-hl__text">{props.text}</span>
          {props.note ? (
            <span class="reader-hl__note">批注：{props.note}</span>
          ) : null}
          {props.showTags && props.record.tags?.length ? (
            <span class="reader-hl__tags">
              {props.record.tags.map((tag) => (
                <span class="reader-hl__tag" key={tag}>
                  {tag}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </button>
    );
  },
});
