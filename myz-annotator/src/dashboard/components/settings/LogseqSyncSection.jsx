import { defineComponent } from "vue";

export default defineComponent({
  name: "LogseqSyncSection",
  props: {
    syncEnabled: {
      type: Boolean,
      default: false,
    },
    form: {
      type: Object,
      required: true,
    },
    onToggle: {
      type: Function,
      required: true,
    },
    onUpdateField: {
      type: Function,
      required: true,
    },
    onSave: {
      type: Function,
      required: true,
    },
    status: {
      type: String,
      default: "",
    },
  },
  setup(props) {
    const fields = [
      {
        key: "logseqEndpoint",
        label: "服务器地址",
        placeholder: "http://127.0.0.1:12315/api",
        type: "url",
      },
      {
        key: "logseqPage",
        label: "目标页面",
        placeholder: "MyZ Inbox",
      },
      {
        key: "logseqGraph",
        label: "Graph 名称 (可选)",
        placeholder: "默认 graph",
      },
      {
        key: "logseqAuthToken",
        label: "认证 Token (可选)",
        placeholder: "Bearer ...",
      },
    ];

    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>LogSeq 同步</h3>
          <label class="toggle">
            <input
              type="checkbox"
              checked={props.syncEnabled}
              onChange={props.onToggle}
            />
            <span>启用同步</span>
          </label>
        </div>
        <div
          class={[
            "settings__fields",
            props.syncEnabled ? "" : " is-disabled",
          ].join(" ")}
        >
          {fields.map((field) => (
            <label class="field" key={field.key}>
              <span>{field.label}</span>
              <input
                type={field.type || "text"}
                placeholder={field.placeholder}
                value={props.form[field.key]}
                disabled={!props.syncEnabled}
                onInput={(event) =>
                  props.onUpdateField(field.key, event.target.value)
                }
              />
            </label>
          ))}
          <div class="settings__actions">
            <button
              class="btn btn-primary"
              type="button"
              onClick={props.onSave}
            >
              保存设置
            </button>
            <p class="status-line">{props.status}</p>
          </div>
        </div>
      </section>
    );
  },
});
