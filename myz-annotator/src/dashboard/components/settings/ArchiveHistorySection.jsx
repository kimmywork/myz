import { defineComponent } from "vue";

export default defineComponent({
  name: "ArchiveHistorySection",
  props: {
    entries: {
      type: Array,
      default: () => [],
    },
    loading: {
      type: Boolean,
      default: false,
    },
    metaLabel: {
      type: String,
      default: "",
    },
    describeAction: {
      type: Function,
      required: true,
    },
    historyStatusTone: {
      type: Function,
      required: true,
    },
    historyStatusLabel: {
      type: Function,
      required: true,
    },
    formatDateTime: {
      type: Function,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>请求历史</h3>
          {props.metaLabel && (
            <span class="settings__group-meta">{props.metaLabel}</span>
          )}
        </div>
        <div class="settings__fields settings__fields--compact">
          {props.loading ? (
            <p class="settings__hint">加载中…</p>
          ) : props.entries.length ? (
            <ul class="settings__list">
              {props.entries.map((item) => (
                <li class="settings__list-item" key={item.id}>
                  <div class="settings__list-row">
                    <span class="settings__list-title">
                      {item.message || props.describeAction(item.action)}
                    </span>
                    <span
                      class={[
                        "settings__pill",
                        `settings__pill--${props.historyStatusTone(item)}`,
                      ].join(" ")}
                    >
                      {props.historyStatusLabel(item)}
                    </span>
                  </div>
                  <div class="settings__list-meta">
                    {item.timestamp ? (
                      <span>{props.formatDateTime(item.timestamp)}</span>
                    ) : null}
                    <span>{props.describeAction(item.action)}</span>
                    {typeof item.statusCode === "number" ? (
                      <span>HTTP {item.statusCode}</span>
                    ) : null}
                  </div>
                  <div class="settings__list-url" title={item.url}>
                    {item.url}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p class="settings__empty">暂无请求记录</p>
          )}
        </div>
      </section>
    );
  },
});
