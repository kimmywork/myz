import { Archive, Check, Clock, Star, Tag, Trash2 } from "@lucide/vue";
import { ListRow, StatusPill } from "@myz/dashboard-ui";
import {
  formatDateTime,
  getRecordKindLabel,
  hostnameForRecord,
} from "@myz/shared/recordDisplay";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import { excerpt, inboxStatusPill } from "./inbox-utils.js";
import type { InboxApi } from "./useInboxQueue.js";
import type { InboxQueueItem } from "@/background/messages/inbox";

/** One flush Inbox row (§4.25): no card, one line of text, actions on hover. */
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
      const pill = inboxStatusPill(item);
      const source = item.record.title || hostnameForRecord(item.record);
      const host = hostnameForRecord(item.record);
      const meta = [
        source,
        host && host !== source ? host : "",
        formatDateTime(item.record.createdAt),
      ]
        .filter(Boolean)
        .join(" · ");

      return (
        <ListRow
          title={excerpt(item.record.text || item.record.note, 200)}
          meta={meta}
          tone={item.record.kind === "clip" ? "clip" : "tag"}
          active={a.detailItemId.value === item.targetId}
          selected={a.selected.value.has(item.targetId)}
          onOpen={() => a.openDetail(item)}
          data-testid="inbox-row"
          draggable
          onDragstart={(event: DragEvent) => a.startRecordDrag(item, event)}
          onDragend={a.endDrag}
          onDragover={(event: DragEvent) => event.preventDefault()}
          onDrop={(event: DragEvent) => a.onDropOnRecord(event, item)}
        >
          {{
            leading: () => (
              <input
                type="checkbox"
                class="h-4 w-4 shrink-0"
                checked={a.selected.value.has(item.targetId)}
                onChange={() => a.toggleSelect(item.targetId)}
                aria-label="选择"
              />
            ),
            badges: () => (
              <>
                <span class="shrink-0 rounded-tag border border-line px-1.5 text-tag text-muted">
                  {getRecordKindLabel(item.record)}
                </span>
                <StatusPill
                  label={pill.label}
                  tone={pill.tone}
                  icon={pill.icon}
                />
                {item.marked ? (
                  <span class="inline-flex shrink-0 items-center gap-1 text-tag text-accent-text">
                    <Star size={12} aria-hidden="true" /> 已标记
                  </span>
                ) : null}
              </>
            ),
            actions: () => (
              <>
                <button
                  class="btn myz-list-row__action h-7 w-7 rounded-control p-0"
                  type="button"
                  onClick={() => a.toggleMark(item)}
                  aria-label="标记"
                  title="标记"
                >
                  <Star size={14} />
                </button>
                <button
                  class="btn myz-list-row__action h-7 w-7 rounded-control p-0"
                  type="button"
                  aria-label="标签"
                  aria-expanded={a.taggingId.value === item.targetId}
                  onClick={() => {
                    a.taggingId.value =
                      a.taggingId.value === item.targetId
                        ? null
                        : item.targetId;
                    a.tagDraft.value = "";
                  }}
                >
                  <Tag size={14} />
                </button>
                {a.taggingId.value === item.targetId ? (
                  <input
                    type="text"
                    list="inbox-tag-options"
                    aria-label="添加标签"
                    autofocus
                    class="h-7 rounded-control border border-line bg-surface px-2 text-caption text-text"
                    value={a.tagDraft.value}
                    placeholder="输入标签后回车"
                    onInput={(event: Event) =>
                      (a.tagDraft.value = (
                        event.target as HTMLInputElement
                      ).value)
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
                  class="btn myz-list-row__action h-7 w-7 rounded-control p-0"
                  type="button"
                  onClick={() => a.keep(item)}
                  aria-label="保留"
                  title="保留"
                >
                  <Check size={14} />
                </button>
                <div class="relative flex items-center">
                  <Clock
                    size={14}
                    class="pointer-events-none absolute left-2 text-muted"
                  />
                  <select
                    class="btn myz-list-row__snooze h-7 appearance-none rounded-control pl-7 pr-2 text-caption"
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
                  class="btn myz-list-row__action h-7 w-7 rounded-control p-0"
                  type="button"
                  onClick={() => a.archive(item)}
                  aria-label="归档"
                  title="归档"
                >
                  <Archive size={14} />
                </button>
                <button
                  class="btn btn-danger myz-list-row__action h-7 w-7 rounded-control p-0"
                  type="button"
                  onClick={() => a.remove(item)}
                  aria-label="删除"
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </>
            ),
          }}
        </ListRow>
      );
    };
  },
});
