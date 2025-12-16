import { defineComponent, ref, computed, watch, type Ref } from "vue";
import { ArchiveEntry } from "@/background/internetArchive.js";
import {
  useModalStore,
  ModalOpenOptions,
} from "@/content/stores/modal-store.js";
import { usePreferenceStore } from "@/content/stores/preference-store.js";
import TagInput from "@/dashboard/components/TagInput.jsx";
import { IconPencil, highlightStyleIconMap, makeIcon } from "@/shared/icons.js";
import {
  RECORD_KINDS,
  HIGHLIGHT_STYLE_OPTIONS,
  HIGHLIGHT_STYLES,
  HighlightStyleOption,
} from "@/shared/types.js";

function uniqueNormalizedTags(tags: string[]): string[] {
  const seen = new Set();
  const result: string[] = [];
  tags?.forEach((tag) => {
    if (typeof tag !== "string") {
      return;
    }
    const normalized = tag.trim();
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    result.push(normalized);
  });
  return result;
}

function normalizeTagValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mergeKnownTags(
  current: string[] = [],
  incoming: string[] = [],
): string[] {
  const base = Array.isArray(current) ? current : [];
  const extras = Array.isArray(incoming) ? incoming : [];
  const merged = new Set<string>();
  base.forEach((tag) => {
    const normalized = normalizeTagValue(tag);
    if (normalized) {
      merged.add(normalized);
    }
  });
  extras.forEach((tag) => {
    const normalized = normalizeTagValue(tag);
    if (normalized) {
      merged.add(normalized);
    }
  });
  return Array.from(merged).sort((a, b) => a.localeCompare(b));
}

const titleText = (option: ModalOpenOptions) => {
  if (option.kind === RECORD_KINDS.CLIP) {
    return option.mode === "edit" ? "编辑保存内容" : "保存摘录";
  }
  return option.mode === "edit" ? "编辑批注" : "添加批注";
};

const previewText = (option: ModalOpenOptions): string => {
  return option.preview || "";
};

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
    const tagInputValue = ref("");
    const dropdownOpen: Ref<boolean> = ref(false);
    const filteredOptions: Ref<string[]> = ref([]);
    const activeOptionIndex: Ref<number> = ref(-1);
    const containerRef: Ref<HTMLElement | null> = ref(null);
    const tagInputRef: Ref<HTMLElement | null> = ref(null);
    const archiveEnabled: Ref<boolean> = computed(() =>
      Boolean(options?.archiveEnabled),
    );
    const saveToArchive: Ref<boolean> = computed(() =>
      archiveEnabled.value ? Boolean(options?.saveToArchive) : false,
    );
    const archiveStatus: Ref<ArchiveEntry | null> = computed(() =>
      archiveEnabled.value &&
      options?.archiveStatus &&
      typeof options.archiveStatus === "object"
        ? options.archiveStatus
        : null,
    );

    const archiveOptionVisible = computed(
      () =>
        archiveEnabled.value && store.isHighlight() && mode.value !== "edit",
    );

    const previewStyle = (options: ModalOpenOptions) => {
      if (options.kind !== RECORD_KINDS.HIGHLIGHT) {
        return {};
      }
      return {
        "--myz-highlight-color": options.color,
        backgroundColor:
          options.style === "paint" ? options.color : "transparent",
      };
    };

    const styleOptions: [HIGHLIGHT_STYLES, HighlightStyleOption][] =
      Object.entries(HIGHLIGHT_STYLE_OPTIONS) as [
        HIGHLIGHT_STYLES,
        HighlightStyleOption,
      ][];

    const archiveStatusText = computed(() => {
      if (!archiveOptionVisible.value) {
        return "";
      }
      const status = archiveStatus.value?.status;
      if (
        archiveStatus.value?.saved ||
        status === "saved" ||
        status === "exists"
      ) {
        const timestamp = archiveStatus.value?.snapshot?.timestamp;
        const formatted = formatArchiveTimestamp(timestamp);
        return formatted ? `已有存档：${formatted}` : "已有存档";
      }
      if (status === "pending") {
        return "保存请求已提交";
      }
      if (status === "failed") {
        return "上次保存失败";
      }
      return "";
    });

    const archiveSnapshotUrl = computed(() => {
      if (!archiveOptionVisible.value) {
        return "";
      }
      const link = archiveStatus.value?.snapshot?.url;
      return typeof link === "string" ? link : "";
    });

    function syncFilteredOptions(term = tagInputValue.value) {
      const normalized = term.trim().toLowerCase();
      const blocked = new Set(
        (store.modalOpenOptions.tags || []).map((tag) => tag.toLowerCase()),
      );
      const candidates = availableTags.value.filter((option) => {
        const lower = option.toLowerCase();
        if (blocked.has(lower)) {
          return false;
        }
        return normalized ? lower.includes(normalized) : true;
      });
      filteredOptions.value = candidates.slice(0, 50);
      dropdownOpen.value = filteredOptions.value.length > 0;
      if (!dropdownOpen.value) {
        activeOptionIndex.value = -1;
      } else if (
        activeOptionIndex.value >= filteredOptions.value.length ||
        activeOptionIndex.value === -1
      ) {
        activeOptionIndex.value = filteredOptions.value.length ? 0 : -1;
      }
    }

    function refreshAvailableTags(extra: string[] = []) {
      const extras = Array.isArray(extra)
        ? extra
        : store.modalOpenOptions.tags || [];
      availableTags.value = mergeKnownTags(knownTags, extras);
      syncFilteredOptions(tagInputValue.value);
    }

    watch(tagInputValue, (value) => {
      syncFilteredOptions(value);
    });

    function handleCancel() {
      store.hide();
    }

    function handleDelete() {
      store.deleteRecord();
    }

    function handleSelectColor(index: number) {
      const value = preferenceStore.palette[index];
      if (!value) {
        return;
      }
      store.modalOpenOptions.color = value;
    }

    function handlePaletteInput(index: number, event: Event) {
      const value = (event.target as HTMLInputElement).value;
      store.modalOpenOptions.color = value;
      preferenceStore.updatePaletteEntry(index, value, { persist: true });
    }

    function handleSelectStyle(style: HIGHLIGHT_STYLES) {
      if (!store.isHighlight()) {
        return;
      }
      store.modalOpenOptions.style = style;
    }

    function formatArchiveTimestamp(
      timestamp: string | null | undefined,
    ): string {
      if (typeof timestamp !== "string" || timestamp.length < 12) {
        return "";
      }
      const year = timestamp.slice(0, 4);
      const month = timestamp.slice(4, 6);
      const day = timestamp.slice(6, 8);
      const hour = timestamp.slice(8, 10);
      const minute = timestamp.slice(10, 12);
      return `${year}-${month}-${day} ${hour}:${minute}`;
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
        saveToArchive: archiveOptionVisible.value && saveToArchive.value,
      });
    }

    return () => (
      <div
        ref={containerRef}
        class={["myz-annotator-modal", store.isVisible ? "" : "myz-hidden"]}
      >
        <div class="myz-annotator-modal__body">
          <div class="myz-annotator-modal__header">
            <h3>{titleText(store.modalOpenOptions)}</h3>
            <button
              type="button"
              class="myz-annotator-modal__close"
              onClick={handleCancel}
            >
              &times;
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
              <div class="myz-style-picker" role="radiogroup">
                {styleOptions.map(([value, meta]) => {
                  const isActive = value === store.modalOpenOptions.style;
                  const IconComponent: ReturnType<typeof makeIcon> =
                    highlightStyleIconMap[meta.icon as HIGHLIGHT_STYLES] ||
                    highlightStyleIconMap.paint;
                  return (
                    <button
                      key={value}
                      type="button"
                      class={[
                        "myz-style-picker__option",
                        isActive ? "is-active" : "",
                      ]}
                      data-style={value}
                      role="radio"
                      aria-pressed={isActive ? "true" : "false"}
                      aria-label={meta.label}
                      onClick={() => handleSelectStyle(value)}
                    >
                      <IconComponent
                        class="myz-style-picker__icon"
                        size={18}
                        aria-hidden="true"
                      />
                      <span class="myz-style-picker__label">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
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
                输入后按回车或逗号确认 · Backspace 回删
              </span>
            </div>
            <TagInput
              ref={tagInputRef}
              modelValue={uniqueNormalizedTags(
                store.modalOpenOptions.tags || [],
              )}
              options={availableTags.value}
              placeholder="添加标签"
              allowNew={true}
              variant="content"
              onUpdate:modelValue={(val) => {
                store.modalOpenOptions.tags = Array.isArray(val) ? val : [];
                // keep available tags in sync after external change
                refreshAvailableTags(store.modalOpenOptions.tags);
              }}
            />
          </div>

          {archiveOptionVisible.value ? (
            <div class="myz-annotator-field">
              <div class="myz-annotator-archive">
                <label class="myz-annotator-checkbox">
                  <input
                    type="checkbox"
                    checked={saveToArchive.value}
                    onChange={(event: Event) =>
                      (saveToArchive.value = (
                        event.target as HTMLInputElement
                      ).checked)
                    }
                  />
                  <span>同时保存到 Internet Archive</span>
                </label>
                {archiveStatusText.value ? (
                  <span class="myz-annotator-archive__status">
                    {archiveStatusText.value}
                    {archiveSnapshotUrl.value ? (
                      <a
                        href={archiveSnapshotUrl.value}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看
                      </a>
                    ) : null}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {store.isHighlight() ? (
            <div class="myz-annotator-field">
              <div class="myz-annotator-field__label-row">
                <label>高亮颜色</label>
                <span class="myz-annotator-field__hint">
                  点击选择 · 调整色块可自定义
                </span>
              </div>
              <div class="myz-color-palette" role="radiogroup">
                {preferenceStore.palette.map((color, index) => {
                  const isActive = color === store.modalOpenOptions.color;
                  return (
                    <div
                      class="myz-color-swatch-wrapper"
                      key={`${color}-${index}`}
                    >
                      <button
                        type="button"
                        class={[
                          "myz-color-swatch",
                          isActive ? "is-active" : "",
                        ]}
                        style={{ "--myz-swatch-color": color }}
                        data-index={index}
                        role="radio"
                        aria-label={`选择颜色 ${color}`}
                        aria-pressed={isActive ? "true" : "false"}
                        onClick={() => handleSelectColor(index)}
                      />
                      <button
                        type="button"
                        class="myz-color-edit"
                        aria-label={`编辑颜色 ${color}`}
                        onClick={() => {
                          const input = containerRef.value?.querySelector(
                            `input[data-color-index="${index}"]`,
                          );
                          if (input) {
                            const el = input as HTMLInputElement;
                            if (typeof el.showPicker === "function") {
                              el.showPicker();
                            } else {
                              el.focus();
                              el.click();
                            }
                          }
                        }}
                      >
                        <IconPencil size={12} aria-hidden="true" />
                      </button>
                      <input
                        type="color"
                        class="myz-color-editor"
                        data-color-index={index}
                        value={color}
                        onInput={(event) => handlePaletteInput(index, event)}
                      />
                    </div>
                  );
                })}
              </div>
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
