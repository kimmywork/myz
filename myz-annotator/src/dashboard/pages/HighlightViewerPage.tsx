import { StatePanel } from "@myz/dashboard-ui";
import { computed, defineComponent, ref } from "vue";
import DashboardWorkspaceLayout from "../components/DashboardWorkspaceLayout.jsx";
import DeleteConfirmPopover from "../components/DeleteConfirmPopover.jsx";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";
import { useHighlightViewer } from "./highlight-viewer/useHighlightViewer.js";
import ViewerEditPanel from "./highlight-viewer/ViewerEditPanel.jsx";
import ViewerHeader from "./highlight-viewer/ViewerHeader.jsx";
import { ViewerSnapshotView } from "./highlight-viewer/ViewerSnapshotView.jsx";

/**
 * 划线详情 — snapshot center + record-column navigation (2026-11-23).
 *
 * Entering a record shows its page's snapshot directly: no record cards, no
 * 记录/快照 toggle. The right-hand 记录列 is the navigation (which record of
 * this page you are on) and stays; records also switch by clicking their
 * marks in the snapshot. PDF/EPUB records never land here —
 * `useHighlightViewer` routes them to the embedded reader instead (a
 * document is its own snapshot).
 */
export default defineComponent({
  name: "HighlightViewerPage",
  setup() {
    const highlightsStore = useHighlightsStore();
    const uiStore = useUIStore();
    const a = useHighlightViewer();
    const recordsPanelOpen = ref(window.innerWidth >= 1200);
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
            {/* 顶部条固定：快照滚动不影响（2026-11-23）。 */}
            <div
              class="sticky top-0 z-10 -mx-4 -mt-4 bg-bg px-4 pt-4"
              data-testid="viewer-sticky-bar"
            >
              <ViewerHeader api={a} />
            </div>
            {a.editing.value ? <ViewerEditPanel api={a} /> : null}
            <ViewerSnapshotView
              pageUrl={a.record.value?.sourceUrl || a.record.value?.url || ""}
              records={a.pageRecords.value.map((item) => ({
                id: item.id,
                text: item.text,
                note: item.note,
                color: item.color,
                style: item.style,
              }))}
              activeId={a.recordId.value}
              onSelectRecord={a.navigateToRecord}
            />
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
            // 记录列 = 导航：这一页的记录清单，点选即切换（2026-11-23 用户更正）。
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
