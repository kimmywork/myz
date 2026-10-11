import { TagInput } from "@myz/dashboard-ui";
import { DELETE_CONFIRM, confirmDestructive } from "@myz/shared/dialogs";
import { createFocusTrap, type FocusTrap } from "@myz/shared/focusTrap";
import { IconClose } from "@myz/shared/icons";
import { RECORD_KINDS, type HIGHLIGHT_STYLES } from "@myz/shared/types";
import { computed, defineComponent, nextTick, ref, watch } from "vue";
import type { Ref } from "vue";
import ColorPalette from "./modal/ColorPalette.jsx";
import StylePicker from "./modal/StylePicker.jsx";
import {
  mergeKnownTags,
  previewText,
  titleText,
  uniqueNormalizedTags,
} from "./modal/tag-utils.js";
import {
  useModalStore,
  type ModalOpenOptions,
} from "@/content/stores/modal-store.js";
import { usePreferenceStore } from "@/content/stores/preference-store.js";

export default defineComponent({
  name: "MyZModal",
  setup() {
    const store = useModalStore();
    const preferenceStore = usePreferenceStore();
    const options = store.modalOpenOptions;
    const mode: Ref<"create" | "edit"> = ref(options.mode || "create");
    const knownTags = store.knownTags;
    const availableTags: Ref<string[]> = computed(() =>
      mergeKnownTags(knownTags, store.modalOpenOptions.tags || []),
    );
    const containerRef: Ref<HTMLElement | null> = ref(null);

    let focusTrap: FocusTrap | null = null;
    watch(
      () => store.isVisible,
      async (visible) => {
        if (visible) {
          await nextTick();
          if (containerRef.value) {
            focusTrap = createFocusTrap(containerRef.value, {
              onEscape: () => store.hide(),
            });
            focusTrap.activate();
          }
        } else {
          focusTrap?.deactivate();
          focusTrap = null;
        }
      },
    );

    const previewStyle = (option: ModalOpenOptions) => {
      if (option.kind !== RECORD_KINDS.HIGHLIGHT) return {};
      return {
        "--myz-highlight-color": option.color,
        backgroundColor:
          option.style === "paint" ? option.color : "transparent",
      };
    };

    const handleCancel = () => store.hide();

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape" && store.isVisible) {
        event.stopPropagation();
        store.hide();
      }
    }

    function handleDelete() {
      if (confirmDestructive(DELETE_CONFIRM)) store.deleteRecord();
    }

    function handleSelectColor(index: number) {
      const value = preferenceStore.palette[index];
      if (value) store.modalOpenOptions.color = value;
    }

    function handlePaletteInput(index: number, event: Event) {
      const value = (event.target as HTMLInputElement).value;
      store.modalOpenOptions.color = value;
      preferenceStore.updatePaletteEntry(index, value, { persist: true });
    }

    function handleSelectStyle(style: HIGHLIGHT_STYLES) {
      if (store.isHighlight()) store.modalOpenOptions.style = style;
    }

    function handleSubmit() {
      preferenceStore.persistColor(store.modalOpenOptions.color);
      preferenceStore.persistStyle(store.modalOpenOptions.style);
      store.submit({
        mode: options.mode || "create",
        kind: store.modalOpenOptions.kind || RECORD_KINDS.HIGHLIGHT,
        note: store.modalOpenOptions?.note?.trim() || "",
        tags: [...(store.modalOpenOptions.tags || [])],
        color: store.modalOpenOptions.color,
        style: store.modalOpenOptions.style,
      });
    }

    return () => (
      <div
        ref={containerRef}
        class={["myz-annotator-modal", store.isVisible ? "" : "myz-hidden"]}
        role="dialog"
        aria-modal="true"
        aria-label="编辑标注"
        onKeydown={handleKeydown}
      >
        <div class="myz-annotator-modal__body">
          <div class="myz-annotator-modal__header">
            <h3>{titleText(store.modalOpenOptions)}</h3>
            <button
              type="button"
              class="myz-annotator-modal__close"
              aria-label="关闭"
              onClick={handleCancel}
            >
              <IconClose size={18} aria-hidden="true" />
            </button>
          </div>

          <div class="myz-annotator-preview">
            {store.modalOpenOptions.preview ? (
              store.modalOpenOptions.kind === RECORD_KINDS.HIGHLIGHT ? (
                <span
                  class={[
                    "myz-highlight",
                    "myz-highlight-preview",
                    `myz-highlight--${store.modalOpenOptions.style}`,
                  ]}
                  style={previewStyle(store.modalOpenOptions)}
                >
                  {previewText(store.modalOpenOptions)}
                </span>
              ) : (
                <span>{previewText(store.modalOpenOptions)}</span>
              )
            ) : null}
          </div>

          {store.isHighlight() ? (
            <div class="myz-annotator-field">
              <div class="myz-annotator-field__label-row">
                <label>样式</label>
                <span class="myz-annotator-field__hint">选择呈现方式</span>
              </div>
              <StylePicker
                active={store.modalOpenOptions.style || ""}
                onSelect={handleSelectStyle}
              />
            </div>
          ) : null}

          <div class="myz-annotator-field">
            <label>批注</label>
            <textarea
              rows="4"
              value={store.modalOpenOptions.note}
              onInput={(event: InputEvent) => {
                store.modalOpenOptions.note = (
                  event.target as HTMLTextAreaElement
                ).value;
              }}
            />
          </div>

          <div class="myz-annotator-field">
            <div class="myz-annotator-field__label-row">
              <label>标签</label>
              <span class="myz-annotator-field__hint">
                输入后按回车确认 · Backspace 回删
              </span>
            </div>
            <TagInput
              modelValue={uniqueNormalizedTags(
                store.modalOpenOptions.tags || [],
              )}
              options={availableTags.value}
              placeholder="添加标签"
              allowNew={true}
              variant="content"
              onUpdate:modelValue={(val) => {
                store.modalOpenOptions.tags = Array.isArray(val) ? val : [];
              }}
            />
          </div>

          {store.isHighlight() ? (
            <div class="myz-annotator-field">
              <div class="myz-annotator-field__label-row">
                <label>划线颜色</label>
                <span class="myz-annotator-field__hint">
                  点击选择 · 调整色块可自定义
                </span>
              </div>
              <ColorPalette
                palette={preferenceStore.palette}
                activeColor={store.modalOpenOptions.color || ""}
                onSelect={handleSelectColor}
                onEdit={handlePaletteInput}
              />
            </div>
          ) : null}

          <div class="myz-annotator-actions">
            <button
              type="button"
              class="myz-btn-secondary"
              onClick={handleCancel}
            >
              取消
            </button>
            <button
              type="button"
              class={[
                "myz-btn-danger",
                mode.value === "edit" ? "" : "myz-hidden",
              ]}
              onClick={handleDelete}
            >
              删除
            </button>
            <button
              type="button"
              class="myz-btn-primary"
              onClick={handleSubmit}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    );
  },
});
