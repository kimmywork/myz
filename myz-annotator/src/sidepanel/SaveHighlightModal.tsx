import { defineComponent, ref } from "vue";
import TagInput from "@/dashboard/components/TagInput.jsx";

interface SaveHighlightModalProps {
  visible: boolean;
  aiResponse: string;
  onSave: (data: { note: string; tags: string[] }) => Promise<void>;
  onClose: () => void;
}

export default defineComponent({
  name: "SaveHighlightModal",
  setup(props: SaveHighlightModalProps) {
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
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur"
          onClick={handleClose}
        >
          <div
            class="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <header class="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h3 class="text-lg font-semibold text-slate-900 dark:text-white">
                保存 AI 摘录
              </h3>
              <button
                class="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-500 hover:text-slate-700 dark:border-slate-700 dark:text-slate-300"
                onClick={handleClose}
              >
                ✕
              </button>
            </header>

            <div class="mt-4 space-y-4">
              <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  AI回复内容
                </h4>
                <div class="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap">
                  {props.aiResponse}
                </div>
              </div>

              <div class="space-y-2">
                <label class="text-sm font-medium text-slate-700 dark:text-slate-200">
                  添加备注（可选）
                </label>
                <textarea
                  class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                  v-model={note.value}
                  rows={4}
                  placeholder="添加您的备注..."
                />
              </div>

              <div class="space-y-2">
                <label class="text-sm font-medium text-slate-700 dark:text-slate-200">
                  标签
                </label>
                <TagInput
                  ref={tagInputRef}
                  modelValue={tags.value}
                  onUpdate:modelValue={(val) => (tags.value = val)}
                  placeholder="添加标签，按回车确认"
                />
              </div>
            </div>

            <footer class="mt-6 flex items-center justify-end gap-3">
              <button
                class="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-200"
                onClick={handleClose}
              >
                取消
              </button>
              <button
                class="rounded-full bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-indigo-500 disabled:opacity-60"
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
