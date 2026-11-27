import { resolveReaderLocator } from "@myz/core/source";
import { StatusPill } from "@myz/dashboard-ui";
import { IconClose } from "@myz/shared/icons";
import {
  formatDateTime,
  getRecordKindLabel,
  hostnameForRecord,
} from "@myz/shared/recordDisplay";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import { useRouter } from "vue-router";
import { ViewerSnapshotView } from "../highlight-viewer/ViewerSnapshotView.jsx";
import { inboxStatusPill } from "./inbox-utils.js";
import type { InboxQueueItem } from "@/background/messages/inbox";
import {
  openEpubInWorkspace,
  openPdfInWorkspace,
} from "@/dashboard/utils/open-reader.js";
import { formatNote } from "@/dashboard/utils/records.js";

/** The record fields the snapshot view needs to place every mark on the page. */
export interface DetailPageRecord {
  id: string;
  text?: string;
  anchorText?: string;
  note?: string;
  color?: string;
  style?: unknown;
}

/**
 * Inbox right panel (§4.25, revised 2026-11-27): the same read-only detail the
 * library shows — the page snapshot with every record of the page marked — so
 * the quote is seen in context instead of as raw Markdown. PDF/EPUB records
 * have no web snapshot and open in the embedded reader instead.
 */
export default defineComponent({
  name: "InboxDetailPanel",
  props: {
    item: { type: Object as PropType<InboxQueueItem>, required: true },
    /** Other records on the same page, so all of them anchor onto the copy. */
    pageRecords: {
      type: Array as PropType<DetailPageRecord[]>,
      default: () => [],
    },
    onSelectRecord: {
      type: Function as PropType<(recordId: string) => void>,
      default: undefined,
    },
    onClose: { type: Function as PropType<() => void>, default: undefined },
    /** Removes one tag from the record (the row no longer carries per-tag X). */
    onRemoveTag: {
      type: Function as PropType<(tag: string) => void>,
      default: undefined,
    },
  },
  setup(props) {
    const router = useRouter();

    return () => {
      const record = props.item.record;
      const pill = inboxStatusPill(props.item);
      const tags = record.tags ?? [];
      const url = record.url || record.sourceUrl || "";
      const pageUrl = record.sourceUrl || record.url || "";
      const locator = resolveReaderLocator(record);

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
                {locator ? "原文文档" : "原文快照与上下文"}
              </h3>
              {locator ? (
                <div class="space-y-2">
                  <p class="text-compact text-muted">
                    PDF / EPUB 划线没有网页快照，请在阅读器中查看原文位置。
                  </p>
                  <button
                    class="inline-flex h-8 items-center rounded-control border border-line px-3 text-compact font-semibold text-muted transition hover:border-accent hover:text-accent-text"
                    type="button"
                    onClick={() => {
                      if (locator.kind === "epub") {
                        void openEpubInWorkspace(router, record);
                      } else if (locator.kind === "pdf-page-rect") {
                        void openPdfInWorkspace(router, record);
                      }
                    }}
                  >
                    打开文档
                  </button>
                </div>
              ) : (
                <ViewerSnapshotView
                  pageUrl={pageUrl}
                  records={props.pageRecords}
                  activeId={record.id}
                  onSelectRecord={(id) => props.onSelectRecord?.(id)}
                />
              )}
            </section>

            <section>
              <h3 class="mb-1 text-tag font-semibold uppercase tracking-wide text-muted">
                批注
              </h3>
              {record.note ? (
                <div
                  class="prose prose-sm max-w-none border-l-2 border-line pl-2 font-read text-compact text-text"
                  innerHTML={formatNote(record.note, [])}
                ></div>
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
