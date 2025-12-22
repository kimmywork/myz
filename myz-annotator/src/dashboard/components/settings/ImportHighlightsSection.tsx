import { defineComponent, Ref } from "vue";
import { ImportStatus } from "../../store";
import { ImportStrategy } from "@/background/import";

export interface ImportHighlightsSectionProps {
  importFileRef: Ref<HTMLInputElement | null>;
  importStrategy: ImportStrategy;
  onStrategyChange: (strategy: ImportStrategy) => void;
  onImport: () => void;
  isImporting: boolean;
  status?: ImportStatus;
}

export default defineComponent({
  name: "ImportHighlightsSection",

  setup(props: ImportHighlightsSectionProps) {
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
              ref={props.importFileRef}
              type="file"
              accept="application/json"
            />
          </label>
          <label class="field">
            <span>冲突处理</span>
            <select
              value={props.importStrategy}
              onChange={(event: Event) =>
                props.onStrategyChange(
                  (event.target as HTMLSelectElement).value as ImportStrategy,
                )
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
              disabled={props.isImporting}
              onClick={props.onImport}
            >
              {props.isImporting ? "导入中…" : "导入 JSON"}
            </button>
            <p
              class={[
                "status-line",
                props.status?.tone === "error"
                  ? " status-line--error"
                  : props.status?.tone === "success"
                    ? " status-line--success"
                    : "",
              ].join(" ")}
            >
              {props.status?.message}
            </p>
          </div>
        </div>
      </section>
    );
  },
});
