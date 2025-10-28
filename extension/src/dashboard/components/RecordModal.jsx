import { computed, defineComponent, onBeforeUnmount, onMounted } from "vue";
import { RECORD_KINDS, DEFAULT_COLOR } from "../constants.js";
import { useDashboardStore } from "../store/useDashboardStore.js";
import TagInput from "./TagInput.jsx";

export default defineComponent({
  name: "RecordModal",
  setup() {
    const store = useDashboardStore();
    const modalState = store.modalState;

    const record = computed(() => {
      if (!modalState.recordId) {
        return null;
      }
      return store.highlights.value.find((item) => item.id === modalState.recordId) || null;
    });

    const kind = computed(() => (record.value ? store.getRecordKind(record.value) : RECORD_KINDS.HIGHLIGHT));
    const isVisible = computed(() => Boolean(modalState.recordId));
    const isEditMode = computed(() => modalState.mode === "edit");
    const hasNote = computed(() => Boolean(record.value?.note));
    const availableTags = computed(() => store.availableTags.value);

    function handleOverlayClick(event) {
      if (event.target === event.currentTarget) {
        store.closeModal();
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape" && isVisible.value) {
        store.closeModal();
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
        <div id="record-modal" class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={handleOverlayClick}>
          <div class="modal__dialog" onClick={(event) => event.stopPropagation()}>
            <header class="modal__header">
              <h3 id="modal-title">
                {(() => {
                  const baseTitle = current.title || current.hostname || (clip ? "保存内容" : "标注详情");
                  return clip ? `${baseTitle}（保存）` : baseTitle;
                })()}
              </h3>
              <button type="button" class="btn-icon" aria-label="关闭" onClick={store.closeModal}>
                ✕
              </button>
            </header>
            <div class="modal__body">
              <section class="modal__section">
                <h4 id="modal-quote-label">{clip ? "保存文字" : "标注"}</h4>
                <div class="modal__quote" innerHTML={store.renderHighlight(current)}></div>
              </section>
              <section class="modal__section">
                <h4>批注</h4>
                {isEditMode.value ? (
                  <textarea
                    class="modal__note-input"
                    rows="4"
                    value={modalState.note}
                    onInput={(event) => (modalState.note = event.target.value)}
                  ></textarea>
                ) : (
                  <div class={"modal__note" + (hasNote.value ? "" : " is-empty")} innerHTML={hasNote.value ? store.formatNote(current.note) : "无批注"}></div>
                )}
              </section>
              <section class="modal__section">
                <h4>标签</h4>
                {isEditMode.value ? (
                  <TagInput
                    class="modal__tags-input"
                    modelValue={modalState.tags}
                    options={[...new Set([...availableTags.value, ...modalState.tags])].sort((a, b) => a.localeCompare(b))}
                    onUpdate:modelValue={(value) => {
                      modalState.tags = value;
                    }}
                    allowNew
                  />
                ) : (
                  <div class={"modal__tags" + ((current.tags && current.tags.length) ? "" : " is-empty")}>
                    {(current.tags || []).length
                      ? current.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))
                      : "无标签"}
                  </div>
                )}
              </section>
              <section class="modal__section modal__section--inline">
                <div>
                  <h4>颜色</h4>
                  <span class={"modal__color" + (clip ? " is-hidden" : "")} style={{ background: clip ? "transparent" : modalState.color }}></span>
                </div>
                {!clip && isEditMode.value ? (
                  <label class="modal__color-input">
                    <span class="sr-only">选择颜色</span>
                    <input
                      type="color"
                      value={modalState.color}
                      onInput={(event) => {
                        modalState.color = event.target.value || DEFAULT_COLOR;
                      }}
                    />
                  </label>
                ) : null}
              </section>
              <p class="status-line">{modalState.status}</p>
            </div>
            <footer class="modal__footer">
              <button type="button" class="btn btn-secondary" onClick={store.closeModal}>
                {isEditMode.value ? "取消" : "关闭"}
              </button>
              {isEditMode.value ? (
                <button type="button" class="btn btn-primary" disabled={modalState.saving} onClick={store.saveModal}>
                  {modalState.saving ? "保存中…" : "保存"}
                </button>
              ) : null}
            </footer>
          </div>
        </div>
      );
    };
  }
});
