import { Archive, Clock, Inbox, Star, Tag, Trash2 } from "@lucide/vue";
import { IconClose } from "@myz/shared/icons";
import {
  formatDateTime,
  getRecordKindLabel,
  hostnameForRecord,
} from "@myz/shared/recordDisplay";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import { excerpt } from "./inbox-utils.js";
import type { InboxApi } from "./useInboxQueue.js";
import type { InboxQueueItem } from "@/background/messages/inbox";

function StatusPill({ item }: { item: InboxQueueItem }) {
  if (item.state?.status === "snoozed" && item.state.snoozedUntil) {
    return (
      <span class="inline-flex items-center gap-1 rounded-tag bg-surface-2 px-2 py-0.5 text-tag text-muted">
        <Clock size={12} />
        稍后 · {formatDateTime(item.state.snoozedUntil)}
      </span>
    );
  }
  if (item.status === "pending") {
    return (
      <span class="inline-flex items-center gap-1 rounded-tag bg-info-bg px-2 py-0.5 text-tag text-info">
        <Inbox size={12} />
        待处理
      </span>
    );
  }
  return (
    <span class="inline-flex items-center gap-1 rounded-tag bg-surface-2 px-2 py-0.5 text-tag text-muted">
      {item.status === "archived" ? (
        <>
          <Archive size={12} /> 已归档
        </>
      ) : (
        "已保留"
      )}
    </span>
  );
}

/** A single Inbox row with inline tag editing and quick actions. */
export default defineComponent({
  name: "InboxRow",
  props: {
    api: { type: Object as PropType<InboxApi>, required: true },
    item: { type: Object as PropType<InboxQueueItem>, required: true },
  },
  setup(props) {
    return () => {
      const a = props.api;
      const item = props.item;
      return (
        <article
          data-testid="inbox-row"
          draggable
          onDragstart={(event: DragEvent) => a.startRecordDrag(item, event)}
          onDragend={a.endDrag}
          onDragover={(event: DragEvent) => event.preventDefault()}
          onDrop={(event: DragEvent) => a.onDropOnRecord(event, item)}
          class="rounded-panel border border-line bg-surface p-3 dark:border-line dark:bg-surface"
        >
          <div class="flex items-start gap-3">
            <input
              type="checkbox"
              class="mt-1"
              checked={a.selected.value.has(item.targetId)}
              onChange={() => a.toggleSelect(item.targetId)}
              aria-label="选择"
            />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded-tag border border-line px-1.5 py-0.5 text-tag text-muted">
                  {getRecordKindLabel(item.record)}
                </span>
                <StatusPill item={item} />
                {item.marked ? (
                  <span class="inline-flex items-center gap-1 text-tag text-accent-text">
                    <Star size={12} /> 已标记
                  </span>
                ) : null}
              </div>
              <p
                class="mt-1 text-compact text-text"
                style="font-family: var(--myz-read); line-height: 1.55"
              >
                {excerpt(item.record.text || item.record.note)}
              </p>
              <div class="mt-1 text-caption text-muted">
                {item.record.title || hostnameForRecord(item.record)}
                {item.record.title && hostnameForRecord(item.record)
                  ? ` · ${hostnameForRecord(item.record)}`
                  : ""}
                {" · "}
                {formatDateTime(item.record.createdAt)}
              </div>
              {item.record.tags && item.record.tags.length > 0 ? (
                <div class="mt-1 flex flex-wrap items-center gap-1">
                  {item.record.tags.map((tag) => (
                    <span
                      key={tag}
                      class="inline-flex items-center gap-1 rounded-tag border border-line px-1.5 py-0.5 text-tag text-muted"
                    >
                      {tag}
                      <button
                        type="button"
                        class="hit-expand text-muted hover:text-error"
                        aria-label={`移除标签 ${tag}`}
                        onClick={() => void a.removeTag(item, tag)}
                      >
                        <IconClose size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <button
              class="btn btn-small"
              type="button"
              onClick={() => a.toggleMark(item)}
              title="标记"
            >
              <Star size={14} /> 标记
            </button>
            <button
              class="btn btn-small"
              type="button"
              aria-expanded={a.taggingId.value === item.targetId}
              onClick={() => {
                a.taggingId.value =
                  a.taggingId.value === item.targetId ? null : item.targetId;
                a.tagDraft.value = "";
              }}
            >
              <Tag size={14} /> 标签
            </button>
            {a.taggingId.value === item.targetId ? (
              <input
                type="text"
                list="inbox-tag-options"
                aria-label="添加标签"
                autofocus
                class="h-8 rounded-control border border-line bg-surface px-2 text-caption text-text"
                value={a.tagDraft.value}
                placeholder="输入标签后回车"
                onInput={(event: Event) =>
                  (a.tagDraft.value = (event.target as HTMLInputElement).value)
                }
                onKeydown={(event: KeyboardEvent) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void a.commitTagDraft(item);
                  } else if (event.key === "Escape") {
                    a.taggingId.value = null;
                    a.tagDraft.value = "";
                  }
                }}
                onBlur={() => void a.commitTagDraft(item)}
              />
            ) : null}
            <button
              class="btn btn-small"
              type="button"
              onClick={() => a.keep(item)}
            >
              保留
            </button>
            <div class="relative flex items-center">
              <Clock
                size={14}
                class="pointer-events-none absolute left-2 text-muted"
              />
              <select
                class="btn btn-small appearance-none pl-7"
                aria-label="稍后"
                value=""
                onChange={(event: Event) => {
                  const value = (event.target as HTMLSelectElement).value;
                  if (
                    value === "evening" ||
                    value === "tomorrow" ||
                    value === "week"
                  ) {
                    void a.snoozeBucket(item, value);
                    (event.target as HTMLSelectElement).value = "";
                  }
                }}
              >
                <option value="">稍后</option>
                <option value="evening">今天晚些</option>
                <option value="tomorrow">明天</option>
                <option value="week">本周</option>
              </select>
            </div>
            <button
              class="btn btn-small"
              type="button"
              onClick={() => a.archive(item)}
            >
              <Archive size={14} /> 归档
            </button>
            <button
              class="btn btn-small btn-danger"
              type="button"
              onClick={() => a.remove(item)}
            >
              <Trash2 size={14} /> 删除
            </button>
          </div>
        </article>
      );
    };
  },
});
