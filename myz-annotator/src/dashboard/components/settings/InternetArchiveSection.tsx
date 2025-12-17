import { defineComponent } from "vue";

type FormKeys = "internetArchiveAccessKey" | "internetArchiveAccessSecret";

interface InternetArchiveSectionProps {
  archiveEnabled: boolean;
  form?: Record<FormKeys, string>;
  onToggle: (e: Event) => void;
  onUpdateField: (field: FormKeys, value: string) => void;
  onSave: () => void;
  status: string;
}

export default defineComponent({
  name: "InternetArchiveSection",
  setup(props: InternetArchiveSectionProps) {
    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>Internet Archive</h3>
          <label class="toggle">
            <input
              type="checkbox"
              checked={props.archiveEnabled}
              onChange={props.onToggle}
            />
            <span>启用保存到 Internet Archive</span>
          </label>
        </div>
        <div
          class={[
            "settings__fields",
            props.archiveEnabled ? "" : " is-disabled",
          ].join(" ")}
        >
          <label class="field">
            <span>Access Key (可选)</span>
            <input
              type="text"
              placeholder="Internet Archive Access Key"
              value={props.form?.internetArchiveAccessKey}
              disabled={!props.archiveEnabled}
              onInput={(event: InputEvent) =>
                props.onUpdateField(
                  "internetArchiveAccessKey",
                  (event.target as HTMLInputElement).value,
                )
              }
            />
          </label>
          <label class="field">
            <span>Access Secret (可选)</span>
            <input
              type="password"
              placeholder="Internet Archive Access Secret"
              value={props.form?.internetArchiveAccessSecret}
              disabled={!props.archiveEnabled}
              onInput={(event: InputEvent) =>
                props.onUpdateField(
                  "internetArchiveAccessSecret",
                  (event.target as HTMLInputElement).value,
                )
              }
            />
          </label>
          <div class="settings__actions">
            <button
              class="btn btn-primary"
              type="button"
              disabled={!props.archiveEnabled}
              onClick={props.onSave}
            >
              保存 Internet Archive 设置
            </button>
            <p class="status-line">{props.status}</p>
          </div>
        </div>
      </section>
    );
  },
});
