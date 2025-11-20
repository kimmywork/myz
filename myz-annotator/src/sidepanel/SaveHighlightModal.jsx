import { defineComponent, ref, reactive, nextTick } from "vue";
import TagInput from "../dashboard/components/TagInput.jsx";

export default defineComponent({
  name: "SaveHighlightModal",
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    aiResponse: {
      type: String,
      default: "",
    },
    onSave: {
      type: Function,
      required: true,
    },
    onClose: {
      type: Function,
      required: true,
    },
  },
  setup(props) {
    const note = ref("");
    const tags = ref(["ai-generated"]);
    const saving = ref(false);
    const tagInputRef = ref(null);

    function handleSave() {
      saving.value = true;
      props
        .onSave({
          note: note.value,
          tags: [...tags.value],
        })
        .finally(() => {
          saving.value = false;
          handleClose();
        });
    }

    function handleClose() {
      note.value = "";
      tags.value = ["ai-generated"];
      props.onClose();
    }

    return () =>
      props.visible ? (
        <div class="modal-overlay" onClick={handleClose}>
          <div class="modal-content" onClick={(e) => e.stopPropagation()}>
            <header class="modal-header">
              <h3>保存AI摘录</h3>
              <button class="close-btn" onClick={handleClose}>
                ×
              </button>
            </header>

            <div class="modal-body">
              <div class="ai-response-preview">
                <h4>AI回复内容</h4>
                <div class="preview-content">{props.aiResponse}</div>
              </div>

              <div class="form-group">
                <label>添加备注（可选）</label>
                <textarea
                  v-model={note.value}
                  rows={4}
                  placeholder="添加您的备注..."
                />
              </div>

              <div class="form-group">
                <label>标签</label>
                <TagInput
                  ref={tagInputRef}
                  modelValue={tags.value}
                  onUpdate:modelValue={(val) => (tags.value = val)}
                  placeholder="添加标签，按回车确认"
                />
              </div>
            </div>

            <footer class="modal-footer">
              <button class="btn btn-secondary" onClick={handleClose}>
                取消
              </button>
              <button
                class="btn btn-primary"
                onClick={handleSave}
                disabled={saving.value}
              >
                {saving.value ? "保存中..." : "保存摘录"}
              </button>
            </footer>
          </div>
        </div>
      ) : null;
  },
});
