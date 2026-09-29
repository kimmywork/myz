import { X } from "@lucide/vue";
import { TagInput } from "@myz/dashboard-ui";
import { DELETE_CONFIRM, confirmDestructive } from "@myz/shared/dialogs";
import { createFocusTrap, type FocusTrap } from "@myz/shared/focusTrap";
import {
  colorName,
  DEFAULT_COLORS,
  HIGHLIGHT_STYLE_OPTIONS,
  HIGHLIGHT_STYLES,
  RECORD_KINDS,
  type MyZRecord,
} from "@myz/shared/types";
import { defineComponent, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { PropType } from "vue";

interface HighlightPatch {
  note: string;
  tags: string[];
  color?: string;
  style?: HIGHLIGHT_STYLES;
}

/**
 * In-place editor for an EPUB highlight (EPUB plan E5): note, tags, colour and
 * style. Mirrors the PDF inspector but lives in the reader page.
 */
export default defineComponent({
  name: "EpubHighlightPanel",
  props: {
    record: {
      type: Object as PropType<MyZRecord | null>,
      default: null,
    },
    palette: {
      type: Array as PropType<string[]>,
      default: () => [...DEFAULT_COLORS],
    },
    tagOptions: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    onSave: {
      type: Function as PropType<(patch: HighlightPatch) => void>,
      default: undefined,
    },
    onDelete: {
      type: Function as PropType<() => void>,
      default: undefined,
    },
    onClose: {
      type: Function as PropType<() => void>,
      default: undefined,
    },
  },
  setup(props) {
    const note = ref("");
    const tags = ref<string[]>([]);
    const color = ref<string>(DEFAULT_COLORS[0]);
    const style = ref<HIGHLIGHT_STYLES>(HIGHLIGHT_STYLES.PAINT);
    const inspectorRef = ref<HTMLElement | null>(null);
    let focusTrap: FocusTrap | null = null;

    watch(
      () => props.record,
      async (record) => {
        if (!record) {
          focusTrap?.deactivate();
          focusTrap = null;
          return;
        }
        note.value = record.note || "";
        tags.value = Array.isArray(record.tags) ? [...record.tags] : [];
        color.value = record.color || DEFAULT_COLORS[0];
        style.value = record.style || HIGHLIGHT_STYLES.PAINT;
        await nextTick();
        if (inspectorRef.value) {
          focusTrap = createFocusTrap(inspectorRef.value, {
            onEscape: () => props.onClose?.(),
          });
          focusTrap.activate();
        }
      },
      { immediate: true },
    );

    onBeforeUnmount(() => {
      focusTrap?.deactivate();
      focusTrap = null;
    });

    const styleOptions = Object.entries(HIGHLIGHT_STYLE_OPTIONS) as [
      HIGHLIGHT_STYLES,
      { label: string },
    ][];

    return () => {
      const record = props.record;
      if (!record) {
        return null;
      }
      const isHighlight = record.kind === RECORD_KINDS.HIGHLIGHT;
      return (
        <aside class="reader-inspector" ref={inspectorRef}>
          <header class="reader-inspector__head">
            <span>
              {isHighlight ? "划线" : "摘录"}
              {record.epubLocator
                ? ` · 第 ${record.epubLocator.spineIndex + 1} 章`
                : ""}
            </span>
            <button
              type="button"
              aria-label="关闭"
              onClick={() => props.onClose?.()}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>

          <blockquote class="reader-inspector__quote">{record.text}</blockquote>

          <textarea
            class="reader-inspector__note"
            rows="3"
            placeholder="添加批注…"
            value={note.value}
            onInput={(event: Event) => {
              note.value = (event.target as HTMLTextAreaElement).value;
            }}
          />

          <TagInput
            variant="well"
            modelValue={tags.value}
            options={props.tagOptions}
            placeholder="添加标签"
            allowNew={true}
            onUpdate:modelValue={(value: string[]) => {
              tags.value = Array.isArray(value) ? value : [];
            }}
          />

          {isHighlight ? (
            <div class="reader-inspector__row">
              <span class="reader-inspector__label">样式</span>
              {styleOptions.map(([value, meta]) => (
                <button
                  key={value}
                  type="button"
                  class={
                    "reader-inspector__chip" +
                    (style.value === value ? " is-active" : "")
                  }
                  onClick={() => (style.value = value)}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          ) : null}

          {isHighlight ? (
            <div class="reader-inspector__row">
              <span class="reader-inspector__label">颜色</span>
              {(props.palette.length ? props.palette : DEFAULT_COLORS).map(
                (colorValue) => (
                  <button
                    key={colorValue}
                    type="button"
                    class={
                      "reader-inspector__swatch" +
                      (color.value === colorValue ? " is-active" : "")
                    }
                    style={{ background: colorValue }}
                    aria-label={`选择${colorName(colorValue)}色`}
                    title={colorName(colorValue)}
                    onClick={() => (color.value = colorValue)}
                  />
                ),
              )}
            </div>
          ) : null}

          <div class="reader-inspector__actions">
            <button
              type="button"
              class="reader-inspector__save"
              onClick={() =>
                props.onSave?.({
                  note: note.value.trim(),
                  tags: [...tags.value],
                  color: color.value,
                  style: style.value,
                })
              }
            >
              保存
            </button>
            <button
              type="button"
              class="reader-inspector__delete"
              onClick={() => {
                if (confirmDestructive(DELETE_CONFIRM)) props.onDelete?.();
              }}
            >
              删除
            </button>
          </div>
        </aside>
      );
    };
  },
});
