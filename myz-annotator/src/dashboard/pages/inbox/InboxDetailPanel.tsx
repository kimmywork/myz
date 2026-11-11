import { StatusPill } from "@myz/dashboard-ui";
import { IconClose } from "@myz/shared/icons";
import {
  formatDateTime,
  getRecordKindLabel,
  hostnameForRecord,
} from "@myz/shared/recordDisplay";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import { inboxStatusPill } from "./inbox-utils.js";
import type { InboxQueueItem } from "@/background/messages/inbox";

/**
 * Right-side detail panel for the selected Inbox row (§4.25): excerpt, note,
 * tags and source. Editing stays in the viewer; this only reads.
 */
export default defineComponent({
  name: "InboxDetailPanel",
  props: {
    item: { type: Object as PropType<InboxQueueItem>, required: true },
    onClose: { type: Function as PropType<() => void>, default: undefined },
    /** Removes one tag from the record (the row no longer carries per-tag X). */
    onRemoveTag: {
      type: Function as PropType<(tag: string) => void>,
      default: undefined,
    },
  },
  setup(props) {
    return () => {
      const record = props.item.record;
      const pill = inboxStatusPill(props.item);
      const tags = record.tags ?? [];
      const url = record.url || record.sourceUrl || "";

      return (
        <div class="flex h-full min-h-0 flex-col" data-testid="inbox-detail">
          <header class="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
            <span class="rounded-tag border border-line px-1.5 text-tag text-muted">
              {getRecordKindLabel(record)}
            </span>
            <StatusPill
              label={pill.label}
              tone={pill.tone}
              icon={pill.icon}
              size="panel"
            />
            <button
              class="btn ml-auto h-7 w-7 rounded-control p-0"
              type="button"
              aria-label="关闭详情"
              onClick={() => props.onClose?.()}
            >
              <IconClose size={14} />
            </button>
          </header>
          <div class="flex-1 space-y-4 overflow-y-auto p-3">
            <section>
              <h3 class="mb-1 text-tag font-semibold uppercase tracking-wide text-muted">
                原文
              </h3>
              <p
                class="whitespace-pre-wrap text-compact text-text"
                style="font-family: var(--myz-read); line-height: 1.55"
              >
                {record.text || record.note || "（无正文）"}
              </p>
            </section>

            <section>
              <h3 class="mb-1 text-tag font-semibold uppercase tracking-wide text-muted">
                批注
              </h3>
              {record.note ? (
                <p class="border-l-2 border-line pl-2 text-compact text-text">
                  {record.note}
                </p>
              ) : (
                <p class="text-caption text-muted">没有批注</p>
              )}
            </section>

            <section>
              <h3 class="mb-1 text-tag font-semibold uppercase tracking-wide text-muted">
                标签
              </h3>
              {tags.length ? (
                <div class="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      class="inline-flex items-center gap-1 rounded-tag border border-line px-1.5 py-0.5 text-tag text-muted"
                    >
                      {tag}
                      <button
                        type="button"
                        class="hit-expand text-muted hover:text-error"
                        aria-label={`移除标签 ${tag}`}
                        onClick={() => props.onRemoveTag?.(tag)}
                      >
                        <IconClose size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p class="text-caption text-muted">没有标签</p>
              )}
            </section>

            <section>
              <h3 class="mb-1 text-tag font-semibold uppercase tracking-wide text-muted">
                来源
              </h3>
              <p class="text-compact text-text">
                {record.title || hostnameForRecord(record) || "未知来源"}
              </p>
              <p class="text-caption text-muted">
                {hostnameForRecord(record) || "未知网站"} ·{" "}
                {formatDateTime(record.createdAt)}
              </p>
              {url ? (
                <p class="truncate text-caption text-muted" title={url}>
                  {url}
                </p>
              ) : null}
            </section>
          </div>
        </div>
      );
    };
  },
});
