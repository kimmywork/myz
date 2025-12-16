import { formatDateTime } from "../../utils/records";
import { ArchiveQueueEntry, queueStatusTone, queueStatusLabel } from "../../../background/internetArchive";
import { defineComponent } from "vue";

interface ArchiveQueueSectionProps {
  entries: ArchiveQueueEntry[];
  loading: boolean;
  status: string;
  onRefresh: () => void;
}

export default defineComponent({
  name: "ArchiveQueueSection",
  setup(props: ArchiveQueueSectionProps) {
    return () => (
      <section class="settings__group">
        <div class="settings__group-header">
          <h3>保存队列</h3>
          <div class="settings__group-actions">
            <button
              class="btn btn-secondary"
              type="button"
              onClick={props.onRefresh}
              disabled={props.loading}
            >
              {props.loading ? "刷新中…" : "刷新数据"}
            </button>
          </div>
        </div>
        <div class="settings__fields settings__fields--compact">
          {props.status ? (
            <p class="status-line status-line--error">{props.status}</p>
          ) : null}
          {props.loading ? (
            <p class="settings__hint">加载中…</p>
          ) : props.entries.length ? (
            <ul class="settings__list">
              {props.entries.map((item) => (
                <li class="settings__list-item" key={item.id}>
                  <div class="settings__list-row">
                    <span class="settings__list-title" title={item.url}>
                      {item.url}
                    </span>
                    <span
                      class={[
                        "settings__pill",
                        `settings__pill--${queueStatusTone(item)}`,
                      ].join(" ")}
                    >
                      {queueStatusLabel(item)}
                    </span>
                  </div>
                  <div class="settings__list-meta">
                    <span>排队序号 #{(item.position ?? 0) + 1}</span>
                    {item.requestedAt ? (
                      <span>
                        加入时间 {formatDateTime(item.requestedAt)}
                      </span>
                    ) : null}
                    <span>尝试 {item.attempts ?? 0} 次</span>
                    {item.force ? (
                      <span class="settings__pill settings__pill--accent">
                        强制
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p class="settings__empty">暂无排队的保存请求</p>
          )}
        </div>
      </section>
    );
  },
});
