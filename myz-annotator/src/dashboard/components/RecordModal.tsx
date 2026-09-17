import { TagInput } from "@myz/dashboard-ui";
import { DEFAULT_COLOR, RECORD_KINDS, getRecordKind } from "@myz/shared/types";
import { computed, defineComponent, onBeforeUnmount, onMounted } from "vue";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";

export default defineComponent({
  name: "RecordModal",
  setup() {
    const highlightsStore = useHighlightsStore();
    const uiStore = useUIStore();
    const modalState = uiStore.modalState;

    const record = computed(() => {
      if (!modalState.recordId) {
        return null;
      }
      return (
        highlightsStore.highlights.find(
          (item) => item.id === modalState.recordId,
        ) || null
      );
    });

    const kind = computed(() =>
      record.value ? getRecordKind(record.value) : RECORD_KINDS.HIGHLIGHT,
    );
    const isHighlight = computed(() => kind.value === RECORD_KINDS.HIGHLIGHT);
    const isVisible = computed(() => Boolean(modalState.recordId));
    const isEditMode = computed(() => modalState.mode === "edit");
    const hasNote = computed(() => Boolean(record.value?.note));
    const availableTags = computed(() => highlightsStore.availableTags);

    function handleOverlayClick(event: MouseEvent) {
      if (event.target === event.currentTarget) {
        uiStore.closeModal();
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && isVisible.value) {
        uiStore.closeModal();
      }
    }

    function ensureDefaults() {
      if (!modalState.color) {
        modalState.color = DEFAULT_COLOR;
      }
      if (!Array.isArray(modalState.tags)) {
        modalState.tags = [];
      }
    }

    onMounted(() => {
      ensureDefaults();
      window.addEventListener("keydown", handleEscape);
    });

    onBeforeUnmount(() => {
      window.removeEventListener("keydown", handleEscape);
    });

    return () => {
      if (!isVisible.value || !record.value) {
        return null;
      }
      const current = record.value;
      const clip = kind.value === RECORD_KINDS.CLIP;
      return (
        <div
          id="record-modal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-bg p-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={handleOverlayClick}
        >
          <div
            class="w-full max-w-5xl rounded-panel border border-line bg-surface p-6 text-text shadow-float dark:border-line dark:bg-bg dark:text-text"
            onClick={(event) => event.stopPropagation()}
          >
            <header class="flex items-center justify-between border-b border-line pb-4 dark:border-line">
              <h3 class="text-heading font-semibold" id="modal-title">
                {(() => {
                  const baseTitle =
                    current.title ||
                    current.hostname ||
                    (clip ? "摘录内容" : "划线详情");
                  return clip ? `${baseTitle}（保存）` : baseTitle;
                })()}
              </h3>
              <button
                type="button"
                class="rounded-full border border-line px-3 py-1 text-compact text-muted hover:text-text dark:border-line dark:text-muted dark:hover:text-text"
                aria-label="关闭"
                onClick={uiStore.closeModal}
              >
                ✕
              </button>
            </header>
            <div class="mt-4 grid gap-4 lg:grid-cols-2">
              <section class="rounded-control border border-line bg-bg p-4 dark:border-line dark:bg-surface">
                <h4
                  id="modal-quote-label"
                  class="text-caption font-semibold uppercase tracking-wide text-muted"
                >
                  {(() => {
                    if (kind.value === RECORD_KINDS.CLIP) return "摘录";
                    if (kind.value === RECORD_KINDS.BOOKMARK) return "来源";
                    return "划线";
                  })()}
                </h4>
                <div
                  class="mt-2 text-compact text-text"
                  innerHTML={uiStore.renderHighlight(current)}
                ></div>
              </section>
              <section class="rounded-control border border-line bg-bg p-4 dark:border-line dark:bg-surface">
                <h4 class="text-caption font-semibold uppercase tracking-wide text-muted">
                  批注
                </h4>
                {isEditMode.value ? (
                  <textarea
                    data-testid="modal-note-input"
                    class="mt-2 min-h-[130px] w-full rounded-control border border-line bg-surface px-3 py-2 text-compact text-text focus:border-accent focus:outline-none dark:border-line dark:bg-surface-2 dark:text-text"
                    rows="4"
                    value={modalState.note}
                    onInput={(event: InputEvent) =>
                      (modalState.note = (
                        event.target as HTMLInputElement
                      ).value)
                    }
                  ></textarea>
                ) : (
                  <div
                    class="mt-2 min-h-[130px] rounded-control border border-line bg-surface px-3 py-2 text-compact text-muted dark:border-line dark:bg-bg dark:text-muted"
                    innerHTML={
                      hasNote.value
                        ? uiStore.formatNote(current.note!)
                        : "无批注"
                    }
                  ></div>
                )}
              </section>

              <section class="rounded-control border border-line bg-bg p-4 dark:border-line dark:bg-surface">
                <h4 class="text-caption font-semibold uppercase tracking-wide text-muted">
                  标签
                </h4>
                {isEditMode.value ? (
                  <div class="mt-2">
                    <TagInput
                      modelValue={modalState.tags}
                      options={[
                        ...new Set([
                          ...availableTags.value,
                          ...modalState.tags,
                        ]),
                      ].sort((a, b) => a.localeCompare(b))}
                      onUpdate:modelValue={(value) => {
                        modalState.tags = value;
                      }}
                      allowNew
                    />
                  </div>
                ) : (
                  <div class="mt-2 flex flex-wrap gap-2 text-compact text-muted">
                    {(current.tags || []).length
                      ? current.tags!.map((tag) => (
                        <span
                          key={tag}
                          class="inline-flex h-[22px] items-center rounded-tag bg-tag-bg px-2 text-tag font-semibold text-tag-fg"
                        >
                          {tag}
                        </span>
                        ))
                      : "无标签"}
                  </div>
                )}
              </section>

              <section class="flex items-center justify-between rounded-control border border-line bg-bg p-4 dark:border-line dark:bg-surface">
                <div>
                  <h4 class="text-caption font-semibold uppercase tracking-wide text-muted">
                    颜色
                  </h4>
                  {isHighlight.value ? (
                    <span
                      class="mt-2 inline-block h-3 w-16 rounded-full"
                      style={{ background: modalState.color }}
                    ></span>
                  ) : (
                    <span class="mt-2 inline-block text-caption text-muted">
                      该记录无划线颜色
                    </span>
                  )}
                </div>
                {isHighlight.value && isEditMode.value ? (
                  <label class="inline-flex items-center gap-2 text-compact text-muted">
                    <span>选择颜色</span>
                    <input
                      data-testid="modal-color-input"
                      class="h-10 w-16 rounded-control border border-line bg-transparent dark:border-line"
                      type="color"
                      value={modalState.color}
                      onInput={(event) => {
                        modalState.color =
                          (event.target as HTMLInputElement).value ||
                          DEFAULT_COLOR;
                      }}
                    />
                  </label>
                ) : null}
              </section>
            </div>
            <p class="mt-4 text-caption text-muted">
              {modalState.status}
            </p>
            <footer class="mt-4 flex justify-end gap-3 border-t border-line pt-4 dark:border-line">
              <button
                type="button"
                class="rounded-full border border-line px-4 py-2 text-compact font-semibold text-text hover:border-control-border dark:border-line dark:text-text"
                onClick={uiStore.closeModal}
              >
                {isEditMode.value ? "取消" : "关闭"}
              </button>
              {isEditMode.value ? (
                <button
                  data-testid="modal-save-button"
                  type="button"
                  class="rounded-full bg-accent px-5 py-2 text-compact font-semibold text-on-accent shadow-float transition hover:bg-accent disabled:opacity-60"
                  disabled={modalState.saving}
                  onClick={uiStore.saveModal}
                >
                  {modalState.saving ? "保存中…" : "保存"}
                </button>
              ) : null}
            </footer>
          </div>
        </div>
      );
    };
  },
});
