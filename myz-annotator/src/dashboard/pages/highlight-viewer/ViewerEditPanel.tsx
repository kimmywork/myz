import { TagInput } from "@myz/dashboard-ui";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import type { HighlightViewerApi } from "./useHighlightViewer.js";

/** Inline note + tag editor. */
export default defineComponent({
  name: "ViewerEditPanel",
  props: {
    api: { type: Object as PropType<HighlightViewerApi>, required: true },
  },
  setup(props) {
    return () => {
      const a = props.api;
      return (
        <div class="mt-4 rounded-control border border-line bg-bg p-4 dark:border-line dark:bg-surface">
          <label class="field">
            <span>批注</span>
            <textarea
              value={a.noteDraft.value}
              rows="4"
              onInput={(event: Event) => {
                a.noteDraft.value = (event.target as HTMLTextAreaElement).value;
              }}
            />
          </label>
          <div class="mt-3">
            <TagInput
              modelValue={a.tagsDraft.value}
              options={a.availableTags.value}
              placeholder="添加标签"
              allowNew={true}
              onUpdate:modelValue={(value: string[]) => {
                a.tagsDraft.value = Array.isArray(value) ? value : [];
              }}
            />
          </div>
          <div class="mt-3 flex items-center justify-end gap-2">
            {a.saveError.value ? (
              <span class="mr-auto text-caption text-error">
                {a.saveError.value}
              </span>
            ) : null}
            <button
              type="button"
              class="btn"
              disabled={a.saving.value}
              onClick={a.stopEditing}
            >
              取消
            </button>
            <button
              type="button"
              class="btn btn-primary"
              disabled={a.saving.value}
              onClick={() => void a.saveEditing()}
            >
              {a.saving.value ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      );
    };
  },
});
