import { defineComponent } from "vue";
import {
  ArchiveHistoryEntry,
  describeArchiveAction,
  historyStatusLabel,
  historyStatusTone,
} from "@/background/internetArchive";

import { formatDateTime } from "@/dashboard/utils/records";

export interface ArchiveHistorySectionProps {
  entries: ArchiveHistoryEntry[];
  loading: boolean;
  metaLabel?: string;
}

export default defineComponent({
  name: "ArchiveHistorySection",
  setup(props: ArchiveHistorySectionProps) {
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
                      {item.message || describeArchiveAction(item.action)}
                    </span>
                    <span
                      class={[
                        "settings__pill",
                        `settings__pill--${historyStatusTone(item)}`,
                      ].join(" ")}
                    >
                      {historyStatusLabel(item)}
                    </span>
                  </div>
                  <div class="settings__list-meta">
                    {item.timestamp ? (
                      <span>{formatDateTime(item.timestamp)}</span>
                    ) : null}
                    <span>{describeArchiveAction(item.action)}</span>
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
