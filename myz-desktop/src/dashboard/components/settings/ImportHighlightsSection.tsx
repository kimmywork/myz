import { defineComponent, ref } from "vue"
import type { Ref } from "vue"
import { useHighlightsStore } from "../../stores/highlights"
import type { ImportStrategy } from "@myz/dashboard-core/host"
import type { ImportSource } from "../../utils/import"

export default defineComponent({
  name: "ImportHighlightsSection",
  setup() {
    const store = useHighlightsStore()
    const importFileRef: Ref<HTMLInputElement | null> = ref(null)
    const importStrategy = ref<ImportStrategy>("skip")
    const importSource = ref<ImportSource>("auto")
    const isImporting = ref(false)

    async function handleImport() {
      const fileInput = importFileRef.value
      const file = fileInput?.files?.[0]
      isImporting.value = true
      try {
        await store.importHighlightsFromFile(
          file,
          importStrategy.value,
          importSource.value,
        )
        if (fileInput) {
          fileInput.value = ""
        }
      } finally {
        isImporting.value = false
      }
    }

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>导入标注</h3>
        </div>
        <div class="settings__fields">
          <p class="settings__hint">
            支持导入 MyZ JSON、RainDrop CSV、Weava CSV、Chrome 书签 HTML。
          </p>
          <label class="field">
            <span>导入文件</span>
            <input
              ref={importFileRef}
              type="file"
              accept="application/json,text/csv,text/html,.json,.csv,.html,.htm"
            />
          </label>
          <label class="field">
            <span>导入来源</span>
            <select
              value={importSource.value}
              onChange={(event: Event) => {
                importSource.value = (event.target as HTMLSelectElement)
                  .value as ImportSource
              }}
            >
              <option value="auto">自动识别（推荐）</option>
              <option value="myz-json">MyZ JSON</option>
              <option value="raindrop-csv">RainDrop CSV</option>
              <option value="weava-csv">Weava CSV</option>
              <option value="chrome-bookmarks">Chrome 书签 HTML</option>
            </select>
          </label>
          <label class="field">
            <span>冲突处理</span>
            <select
              value={importStrategy.value}
              onChange={(event: Event) => {
                importStrategy.value = (event.target as HTMLSelectElement)
                  .value as ImportStrategy
              }}
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
              {isImporting.value ? "导入中…" : "开始导入"}
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
    )
  },
})
