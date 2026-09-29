import { Check, Trash2, X } from "@lucide/vue";
import { TagInput } from "@myz/dashboard-ui";
import { DELETE_CONFIRM, confirmDestructive } from "@myz/shared/dialogs";
import { createFocusTrap, type FocusTrap } from "@myz/shared/focusTrap";
import { colorName, RECORD_KINDS } from "@myz/shared/types";
import { storeToRefs } from "pinia";
import {
  computed,
  defineComponent,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from "vue";
import { useReaderStore } from "../stores/reader-store.js";

export default defineComponent({
  name: "PdfInspector",
  setup() {
    const store = useReaderStore();
    const {
      activeRecord,
      noteDraft,
      tagsDraft,
      dirty,
      colorPalette,
      annotations,
    } = storeToRefs(store);
    const inspectorRef = ref<HTMLElement | null>(null);
    let focusTrap: FocusTrap | null = null;

    watch(activeRecord, async (record) => {
      if (record) {
        await nextTick();
        if (inspectorRef.value) {
          focusTrap = createFocusTrap(inspectorRef.value, {
            onEscape: () => (store.activeId = null),
          });
          focusTrap.activate();
        }
      } else {
        focusTrap?.deactivate();
        focusTrap = null;
      }
    });

    onBeforeUnmount(() => {
      focusTrap?.deactivate();
      focusTrap = null;
    });

    const styleOptions = store.styleOptions;
    const tagOptions = computed(() =>
      Array.from(
        new Set(
          annotations.value.flatMap((record) =>
            Array.isArray(record.tags) ? record.tags : [],
          ),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    );

    return () =>
      activeRecord.value ? (
        <aside class="reader-inspector" ref={inspectorRef}>
          <header class="reader-inspector__head">
            <span>
              {activeRecord.value.kind === RECORD_KINDS.CLIP ? "摘录" : "划线"}
              {activeRecord.value.pdfLocator
                ? ` · 第 ${activeRecord.value.pdfLocator.pageNumber} 页`
                : ""}
            </span>
            <button
              type="button"
              aria-label="关闭"
              onClick={() => (store.activeId = null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <blockquote class="reader-inspector__quote">
            {activeRecord.value.text}
          </blockquote>
          {activeRecord.value.kind === RECORD_KINDS.HIGHLIGHT ? (
            <div class="reader-inspector__row">
              <span class="reader-inspector__label">样式</span>
              {styleOptions.map((option) => (
                <button
                  type="button"
                  class={
                    "reader-inspector__chip" +
                    (activeRecord.value?.style === option.style
                      ? " is-active"
                      : "")
                  }
                  key={option.style}
                  onClick={() => store.patchActive({ style: option.style })}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          {activeRecord.value.kind === RECORD_KINDS.HIGHLIGHT ? (
            <div class="reader-inspector__row">
              <span class="reader-inspector__label">颜色</span>
              {colorPalette.value.map((color) => (
                <button
                  type="button"
                  key={color}
                  class={
                    "reader-inspector__swatch" +
                    (activeRecord.value?.color === color ? " is-active" : "")
                  }
                  style={{ background: color }}
                  aria-label={`选择${colorName(color)}色`}
                  title={colorName(color)}
                  onClick={() => store.patchActive({ color })}
                />
              ))}
            </div>
          ) : null}
          <textarea
            class="reader-inspector__note"
            placeholder="添加批注…"
            value={noteDraft.value}
            onInput={(event: Event) => {
              store.noteDraft = (event.target as HTMLTextAreaElement).value;
              store.dirty = true;
            }}
            onBlur={store.commitActive}
          />
          <TagInput
            variant="well"
            modelValue={tagsDraft.value}
            options={tagOptions.value}
            placeholder="添加标签"
            allowNew={true}
            onUpdate:modelValue={(value: string[]) => {
              store.tagsDraft = Array.isArray(value) ? value : [];
              store.dirty = true;
            }}
          />
          <div class="reader-inspector__actions">
            <span class="reader-inspector__status">{store.savedLabel()}</span>
            <button
              type="button"
              class="reader-inspector__save"
              disabled={!dirty.value}
              onClick={store.commitActive}
            >
              <Check size={14} aria-hidden="true" />
              保存
            </button>
            <button
              type="button"
              class="reader-inspector__delete"
              onClick={() => {
                if (confirmDestructive(DELETE_CONFIRM)) store.deleteActive();
              }}
            >
              <Trash2 size={14} aria-hidden="true" />
              删除
            </button>
          </div>
        </aside>
      ) : null;
  },
});
