import {
  HighlightGroups,
  HighlightsPaneShell,
  type HighlightItemAction,
} from "@myz/dashboard-ui";
import type { MyZRecord } from "@myz/shared/types";
import { computed, defineComponent, nextTick, watch } from "vue";
import { useRouter } from "vue-router";
import { useInfiniteScroll } from "../composables/useInfiniteScroll.js";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";
import { openEpubRecordInReader } from "@/reader/open.js";
import { openPdfRecordInReader } from "@/reader/open.js";

export default defineComponent({
  name: "HighlightsPane",
  setup() {
    const highlightsStore = useHighlightsStore();
    const uiStore = useUIStore();
    const router = useRouter();
    const stickyLayout = computed(() => Boolean(uiStore.pageSidebarOpen));

    const { sentinelRef, stop, restart } = useInfiniteScroll({
      onIntersect: () => uiStore.loadMore(),
    });

    const currentPageLabel = computed(() => {
      if (!uiStore.pageFilter) {
        return "";
      }
      const matched = uiStore.pageGroups.find(
        (group) => group.url === uiStore.pageFilter,
      );
      return matched?.title || matched?.hostname || uiStore.pageFilter;
    });
    watch(
      () => uiStore.hasMoreHighlights,
      async (hasMore) => {
        await nextTick();
        if (!hasMore) {
          stop();
          return;
        }
        restart();
      },
    );

    watch(
      () => uiStore.view,
      async () => {
        await nextTick();
        restart();
      },
    );

    watch(
      () => uiStore.visibleHighlights.length,
      async () => {
        await nextTick();
        restart();
      },
    );

    function handleAction(action: HighlightItemAction, record: MyZRecord) {
      switch (action) {
        case "copy":
          void highlightsStore.copyHighlight(record.id);
          break;
        case "delete":
          void highlightsStore.deleteHighlight(record.id);
          break;
        case "view":
          router.push(`/highlights/${record.id}`);
          break;
        case "edit":
          router.push({
            path: `/highlights/${record.id}`,
            query: { edit: "1" },
          });
          break;
        case "downgrade":
          void highlightsStore.downgradeHighlight(record.id);
          break;
        case "openPdf":
          void openPdfRecordInReader(record);
          break;
        case "openEpub":
          void openEpubRecordInReader(record);
          break;
      }
    }

    return () => (
      <HighlightsPaneShell
        summaryText={uiStore.summaryText}
        pageFilter={uiStore.pageFilter}
        currentPageLabel={currentPageLabel.value}
        pageSidebarOpen={uiStore.pageSidebarOpen}
        stickyLayout={stickyLayout.value}
        view={uiStore.view}
        pageSortMode={uiStore.pageSortMode}
        onSetView={uiStore.setView}
        onSetPageSortMode={uiStore.setPageSortMode}
        onTogglePageSidebar={uiStore.togglePageSidebar}
        onClearPageFilter={uiStore.clearPageFilter}
        onExport={(format) => {
          void highlightsStore.handleExport(format);
        }}
      >
        {{
          default: () => (
            <HighlightGroups
              loading={highlightsStore.loadingHighlights}
              view={uiStore.view}
              groups={uiStore.groupedHighlights}
              hasMore={uiStore.hasMoreHighlights}
              setSentinelRef={(value) => {
                sentinelRef.value = value as Element | null;
              }}
              formatInline={uiStore.formatInline}
              formatDateTime={uiStore.formatDateTime}
              renderHighlight={uiStore.renderHighlight}
              formatNote={uiStore.formatNote}
              onAction={handleAction}
            />
          ),
        }}
      </HighlightsPaneShell>
    );
  },
});
