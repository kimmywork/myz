import { StatePanel } from "@myz/dashboard-ui";
import { defineComponent, ref } from "vue";
import DeleteConfirmPopover from "../components/DeleteConfirmPopover.jsx";
import { useHighlightsStore } from "../stores/highlights.js";
import { useHighlightViewer } from "./highlight-viewer/useHighlightViewer.js";
import ViewerEditPanel from "./highlight-viewer/ViewerEditPanel.jsx";
import ViewerFooter from "./highlight-viewer/ViewerFooter.jsx";
import ViewerHeader from "./highlight-viewer/ViewerHeader.jsx";
import ViewerRecordCard from "./highlight-viewer/ViewerRecordCard.jsx";
import { ViewerSnapshotView } from "./highlight-viewer/ViewerSnapshotView.jsx";

export default defineComponent({
  name: "HighlightViewerPage",
  setup() {
    const highlightsStore = useHighlightsStore();
    const a = useHighlightViewer();
    /** Second view (§I8): the captured page body, read-only. */
    const view = ref<"records" | "snapshot">("records");

    return () => {
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
        <section class="rounded-panel border border-line bg-surface p-6 text-text dark:border-line dark:bg-surface dark:text-text">
          <ViewerHeader api={a} />
          <div
            class="mt-3 inline-flex rounded-full border border-line bg-surface p-1 text-caption font-semibold text-muted"
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
          {a.editing.value ? <ViewerEditPanel api={a} /> : null}

          {view.value === "snapshot" ? (
            <ViewerSnapshotView
              recordId={a.recordId.value}
              recordText={a.record.value?.text ?? ""}
            />
          ) : (
            <div
              ref={a.scrollRef}
              class="mt-5 max-h-[70vh] space-y-4 overflow-y-auto pr-1"
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
        </section>
      );
    };
  },
});
