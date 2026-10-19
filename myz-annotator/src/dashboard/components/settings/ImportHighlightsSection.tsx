import { Paperclip } from "@lucide/vue";
import { ImportStrategy } from "@myz/core/import";
import { SelectInput, SettingsRow } from "@myz/dashboard-ui";
import { confirmDestructive } from "@myz/shared/dialogs";
import { defineComponent, Ref, ref } from "vue";
import { useHighlightsStore } from "../../stores/highlights.js";
import { ImportSource } from "@/dashboard/utils/import.js";

export default defineComponent({
  name: "ImportHighlightsSection",

  setup() {
    const store = useHighlightsStore();
    const importFileRef: Ref<HTMLInputElement | null> = ref(null);
    const importStrategy: Ref<ImportStrategy> = ref("skip");
    const importSource: Ref<ImportSource> = ref("auto");
    const importFileName = ref("");
    const isImporting = ref(false);

    async function handleImport() {
      const fileInput = importFileRef.value;
      const file = fileInput?.files?.[0];
      if (
        importStrategy.value === "overwrite" &&
        !confirmDestructive("覆盖策略会用导入内容替换已有重复记录，确定继续？")
      ) {
        return;
      }
      isImporting.value = true;
      try {
        await store.importHighlightsFromFile(
          file,
          importStrategy.value,
          importSource.value,
        );
        if (fileInput) {
          fileInput.value = "";
        }
        importFileName.value = "";
      } catch (error) {
        // status already surfaced by store
      } finally {
        isImporting.value = false;
      }
    }

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>导入记录</h3>
        </div>
        <div class="settings__fields">
          <p class="settings__hint">
            支持导入 MyZ JSON、RainDrop CSV、Weava CSV、Chrome 书签 HTML。
          </p>
          <SettingsRow label="导入文件" controlWidth="auto">
            <span class="flex items-center gap-3">
              <input
                ref={importFileRef}
                type="file"
                class="peer sr-only"
                accept="application/json,text/csv,text/html,.json,.csv,.html,.htm"
                onChange={(event: Event) => {
                  const input = event.target as HTMLInputElement;
                  importFileName.value = input.files?.[0]?.name || "";
                }}
              />
              <span class="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-control border border-control-border bg-control-bg px-3 text-label font-semibold text-text transition peer-hover:border-accent peer-hover:text-accent-text peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-bg peer-disabled:opacity-45">
                <Paperclip size={16} aria-hidden="true" />
                选择文件
              </span>
              <span class="max-w-[180px] truncate text-caption text-muted">
                {importFileName.value || "未选择文件"}
              </span>
            </span>
          </SettingsRow>
          <SettingsRow label="导入来源">
            <SelectInput
              testId="import-source"
              modelValue={importSource.value}
              options={[
                { value: "auto", label: "自动识别（推荐）" },
                { value: "myz-json", label: "MyZ JSON" },
                { value: "raindrop-csv", label: "RainDrop CSV" },
                { value: "weava-csv", label: "Weava CSV" },
                { value: "chrome-bookmarks", label: "Chrome 书签 HTML" },
              ]}
              onChange={(value) => {
                importSource.value = value as ImportSource;
              }}
            />
          </SettingsRow>
          <SettingsRow label="冲突处理">
            <SelectInput
              testId="import-strategy"
              modelValue={importStrategy.value}
              options={[
                { value: "skip", label: "遇到重复时跳过" },
                { value: "overwrite", label: "遇到重复时覆盖" },
                { value: "latest", label: "保留最近更新" },
              ]}
              onChange={(value) => {
                importStrategy.value = value as ImportStrategy;
              }}
            />
          </SettingsRow>
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
    );
  },
});
