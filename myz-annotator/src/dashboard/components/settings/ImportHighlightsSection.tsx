import { defineComponent, Ref, ref } from "vue";
import { useHighlightsStore } from "../../stores/highlights.js";
import { ImportStrategy } from "@/background/import";

export default defineComponent({
  name: "ImportHighlightsSection",

  setup() {
    const store = useHighlightsStore();
    const importFileRef: Ref<HTMLInputElement | null> = ref(null);
    const importStrategy: Ref<ImportStrategy> = ref("skip");
    const isImporting = ref(false);

    async function handleImport() {
      const fileInput = importFileRef.value;
      const file = fileInput?.files?.[0];
      isImporting.value = true;
      try {
        await store.importHighlightsFromFile(file, importStrategy.value);
        if (fileInput) {
          fileInput.value = "";
        }
      } catch (error) {
        // status already surfaced by store
      } finally {
        isImporting.value = false;
      }
    }

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>导入标注</h3>
        </div>
        <div class="settings__fields">
          <p class="settings__hint">
            选择先前导出的 JSON 文件，或导入他人分享的标注。
          </p>
          <label class="field">
            <span>JSON 文件</span>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json"
            />
          </label>
          <label class="field">
            <span>冲突处理</span>
            <select
              value={importStrategy.value}
              onChange={(event: Event) =>
                (importStrategy.value = (
                  event.target as HTMLSelectElement
                ).value as ImportStrategy)
              }
            >
              <option value="skip">遇到重复时跳过</option>
              <option value="overwrite">遇到重复时覆盖</option>
              <option value="latest">保留最近更新</option>
            </select>
          </label>
          <div class="settings__actions">
            <button
              class="btn"
              type="button"
              disabled={isImporting.value}
              onClick={handleImport}
            >
              {isImporting.value ? "导入中…" : "导入 JSON"}
            </button>
            <p
              class={[
                "status-line",
                store.importStatus.tone === "error"
                  ? " status-line--error"
                  : store.importStatus.tone === "success"
                    ? " status-line--success"
                    : "",
              ].join(" ")}
            >
              {store.importStatus.message}
            </p>
          </div>
        </div>
      </section>
    );
  },
});
