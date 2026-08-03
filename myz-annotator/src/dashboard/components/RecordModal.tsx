import { TagInput } from "@myz/dashboard-ui";
import { computed, defineComponent, onBeforeUnmount, onMounted } from "vue";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";
import { DEFAULT_COLOR, RECORD_KINDS, getRecordKind } from "@/shared/types.js";

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
          class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={handleOverlayClick}
        >
          <div
            class="w-full max-w-5xl rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
            onClick={(event) => event.stopPropagation()}
          >
            <header class="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-white/5">
              <h3 class="text-xl font-semibold" id="modal-title">
                {(() => {
                  const baseTitle =
                    current.title ||
                    current.hostname ||
                    (clip ? "保存内容" : "标注详情");
                  return clip ? `${baseTitle}（保存）` : baseTitle;
                })()}
              </h3>
              <button
                type="button"
                class="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 hover:text-slate-800 dark:border-white/20 dark:text-slate-300 dark:hover:text-white"
                aria-label="关闭"
                onClick={uiStore.closeModal}
              >
                ✕
              </button>
            </header>
            <div class="mt-4 grid gap-4 lg:grid-cols-2">
              <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900/60">
                <h4
                  id="modal-quote-label"
                  class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >
                  {(() => {
                    if (kind.value === RECORD_KINDS.CLIP) return "保存文字";
                    if (kind.value === RECORD_KINDS.BOOKMARK) return "网页书签";
                    return "标注";
                  })()}
                </h4>
                <div
                  class="mt-2 text-sm text-slate-800 dark:text-slate-100"
                  innerHTML={uiStore.renderHighlight(current)}
                ></div>
              </section>
              <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900/60">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  批注
                </h4>
                {isEditMode.value ? (
                  <textarea
                    data-testid="modal-note-input"
                    class="mt-2 min-h-[130px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100"
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
                    class="mt-2 min-h-[130px] rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-white/10 dark:bg-slate-950/30 dark:text-slate-300"
                    innerHTML={
                      hasNote.value
                        ? uiStore.formatNote(current.note!)
                        : "无批注"
                    }
                  ></div>
                )}
              </section>

              <section class="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900/60">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
                  <div class="mt-2 flex flex-wrap gap-2 text-sm text-slate-600 dark:text-slate-300">
                    {(current.tags || []).length
                      ? current.tags!.map((tag) => (
                          <span
                            key={tag}
                            class="rounded-full border border-slate-200 px-3 py-1 text-xs dark:border-white/10"
                          >
                            {tag}
                          </span>
                        ))
                      : "无标签"}
                  </div>
                )}
              </section>

              <section class="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-900/60">
                <div>
                  <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    颜色
                  </h4>
                  {isHighlight.value ? (
                    <span
                      class="mt-2 inline-block h-3 w-16 rounded-full"
                      style={{ background: modalState.color }}
                    ></span>
                  ) : (
                    <span class="mt-2 inline-block text-xs text-slate-500 dark:text-slate-400">
                      该记录无高亮颜色
                    </span>
                  )}
                </div>
                {isHighlight.value && isEditMode.value ? (
                  <label class="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <span>选择颜色</span>
                    <input
                      data-testid="modal-color-input"
                      class="h-10 w-16 rounded-xl border border-slate-200 bg-transparent dark:border-white/10"
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
            <p class="mt-4 text-xs text-slate-500 dark:text-slate-400">
              {modalState.status}
            </p>
            <footer class="mt-4 flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-white/5">
              <button
                type="button"
                class="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 dark:border-white/20 dark:text-slate-200"
                onClick={uiStore.closeModal}
              >
                {isEditMode.value ? "取消" : "关闭"}
              </button>
              {isEditMode.value ? (
                <button
                  data-testid="modal-save-button"
                  type="button"
                  class="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
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
