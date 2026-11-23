import { StatePanel } from "@myz/dashboard-ui";
import { computed, defineComponent, ref, watch } from "vue";
import DashboardWorkspaceLayout from "../components/DashboardWorkspaceLayout.jsx";
import DeleteConfirmPopover from "../components/DeleteConfirmPopover.jsx";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";
import { useHighlightViewer } from "./highlight-viewer/useHighlightViewer.js";
import ViewerEditPanel from "./highlight-viewer/ViewerEditPanel.jsx";
import ViewerFooter from "./highlight-viewer/ViewerFooter.jsx";
import ViewerHeader from "./highlight-viewer/ViewerHeader.jsx";
import ViewerRecordCard from "./highlight-viewer/ViewerRecordCard.jsx";
import { ViewerSnapshotView } from "./highlight-viewer/ViewerSnapshotView.jsx";

/**
 * 划线详情 on the workspace shell (§4.27): main area carries the reader
 * stack or the snapshot view; the right panel is the 记录列 (§3.4) that stays
 * beside the snapshot so records can be jumped between.
 */
export default defineComponent({
  name: "HighlightViewerPage",
  setup() {
    const highlightsStore = useHighlightsStore();
    const uiStore = useUIStore();
    const a = useHighlightViewer();
    /** Second view (§I8): the captured page body, read-only. */
    const view = ref<"records" | "snapshot">("records");
    const recordsPanelOpen = ref(false);

    // The record column belongs to the snapshot view (§3.4). Below 1200 the
    // shell turns the panel into an overlay, so it only auto-opens where it
    // can stay beside the content instead of covering it.
    watch(view, (next) => {
      if (next === "snapshot" && window.innerWidth >= 1200) {
        recordsPanelOpen.value = true;
      }
    });

    const activeRow = computed(() => a.recordId.value);

    return () => {
      const body = () => {
        if (highlightsStore.loadingHighlights) {
          return <StatePanel kind="loading" title="正在加载…" />;
        }
        if (!a.record.value) {
          return (
            <StatePanel
              kind="error"
              title="未找到这条记录"
              hint="这条记录可能已被删除或尚未同步"
              actionLabel="返回列表"
              onAction={a.backToList}
            />
          );
        }
        return (
          <div class="flex min-h-0 flex-col gap-3 p-4">
            <ViewerHeader api={a} />
            <div class="flex flex-wrap items-center gap-3">
              <div
                class="inline-flex rounded-full border border-line bg-surface p-1 text-caption font-semibold text-muted"
                role="group"
                aria-label="查看方式"
              >
                <button
                  type="button"
                  class={[
                    "h-7 rounded-full px-3 transition",
                    view.value === "records" ? "bg-accent text-on-accent" : "",
                  ].join(" ")}
                  aria-pressed={view.value === "records"}
                  onClick={() => (view.value = "records")}
                >
                  记录
                </button>
                <button
                  type="button"
                  class={[
                    "h-7 rounded-full px-3 transition",
                    view.value === "snapshot" ? "bg-accent text-on-accent" : "",
                  ].join(" ")}
                  aria-pressed={view.value === "snapshot"}
                  data-testid="view-snapshot"
                  onClick={() => (view.value = "snapshot")}
                >
                  整页快照
                </button>
              </div>
              <button
                type="button"
                class="rounded-control border border-line px-3 py-1.5 text-caption text-muted hover:text-text"
                aria-pressed={recordsPanelOpen.value}
                data-testid="toggle-records-panel"
                onClick={() => {
                  recordsPanelOpen.value = !recordsPanelOpen.value;
                }}
              >
                记录列
              </button>
            </div>
            {a.editing.value ? <ViewerEditPanel api={a} /> : null}

            {view.value === "snapshot" ? (
              <ViewerSnapshotView
                recordId={a.recordId.value}
                recordText={a.record.value?.text ?? ""}
              />
            ) : (
              <div
                ref={a.scrollRef}
                class="mt-2 max-h-[70vh] space-y-4 overflow-y-auto pr-1"
                onScroll={a.handleScroll}
              >
                {a.pageRecords.value.map((item) => (
                  <ViewerRecordCard
                    key={item.id}
                    api={a}
                    item={item}
                    isActive={item.id === a.recordId.value}
                  />
                ))}
              </div>
            )}

            <ViewerFooter api={a} />
            <DeleteConfirmPopover />
          </div>
        );
      };

      return (
        <DashboardWorkspaceLayout
          panelOpen={recordsPanelOpen.value}
          onClosePanel={() => (recordsPanelOpen.value = false)}
        >
          {{
            default: body,
            panel: () => (
              <nav
                class="flex min-h-0 flex-col gap-1 overflow-y-auto p-2"
                aria-label="记录列"
              >
                {a.pageRecords.value.map((item) => {
                  const active = item.id === activeRow.value;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      class={[
                        "rounded-control px-3 py-2 text-left text-compact transition",
                        active
                          ? "bg-surface-2 text-accent-text"
                          : "text-muted hover:bg-surface-2",
                      ].join(" ")}
                      aria-current={active ? "true" : undefined}
                      data-testid="viewer-record-row"
                      data-record-id={item.id}
                      onClick={() => a.navigateToRecord(item.id)}
                    >
                      <span class="line-clamp-2">
                        {(item.text || item.note || "（无文字）").slice(0, 60)}
                      </span>
                      <span class="mt-1 block text-tag text-muted">
                        {uiStore.formatDateTime(item.createdAt)}
                      </span>
                    </button>
                  );
                })}
              </nav>
            ),
          }}
        </DashboardWorkspaceLayout>
      );
    };
  },
});
