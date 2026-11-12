import {
  HighlightGroups,
  HighlightsPaneShell,
  QuickSearch,
  SelectionBar,
  type HighlightItemAction,
} from "@myz/dashboard-ui";
import type { MyZRecord } from "@myz/shared/types";
import { computed, defineComponent, nextTick, watch } from "vue";
import type { PropType } from "vue";
import { useRouter } from "vue-router";
import { useInfiniteScroll } from "../composables/useInfiniteScroll.js";
import { useLibraryBatchActions } from "../composables/useLibraryBatchActions.js";
import {
  libraryViewKey,
  useLibrarySelection,
} from "../composables/useLibrarySelection.js";
import { useDeleteStore } from "../stores/delete.js";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";
import { openEpubRecordInReader } from "@/reader/open.js";
import { openPdfRecordInReader } from "@/reader/open.js";

export default defineComponent({
  name: "HighlightsPane",
  props: {
    /** Opens the workspace nav drawer below 900px (§4.27). */
    onOpenNav: { type: Function as PropType<() => void>, default: undefined },
  },
  setup(props) {
    const highlightsStore = useHighlightsStore();
    const deleteStore = useDeleteStore();
    const uiStore = useUIStore();
    const router = useRouter();

    const { sentinelRef, stop, restart } = useInfiniteScroll({
      onIntersect: () => uiStore.loadMore(),
    });

    // Selection belongs to the view: filters / search / page filter clear it.
    // Cards↔list is not part of the key — same records, different paint.
    const viewKey = computed(() =>
      libraryViewKey({
        quickSearch: uiStore.quickSearch,
        search: uiStore.filters.search,
        site: uiStore.filters.site,
        tags: uiStore.filters.tags,
        from: uiStore.filters.from,
        to: uiStore.filters.to,
        pageFilter: uiStore.pageFilter,
      }),
    );
    const selection = useLibrarySelection(viewKey);
    // Rows hidden by a pending delete are not selectable either: select-all
    // must not resurrect one into the batch (its row is not on screen).
    const visibleIds = computed(() =>
      uiStore.visibleHighlights
        .map((record) => record.id)
        .filter((id) => !deleteStore.pendingIds.has(id)),
    );
    watch(
      () => highlightsStore.highlights,
      (records) => {
        selection.prune(new Set(records.map((record) => record.id)));
      },
    );
    // A record with a pending delete leaves the selection too (the row is
    // hidden until the window ends); undo brings the row back unselected.
    watch(
      () => deleteStore.pendingIds,
      (pending) => {
        selection.prune(
          new Set(
            highlightsStore.highlights
              .map((record) => record.id)
              .filter((id) => !pending.has(id)),
          ),
        );
      },
    );

    const selectedRecords = computed(() =>
      highlightsStore.highlights.filter(
        (record) =>
          selection.has(record.id) && !deleteStore.pendingIds.has(record.id),
      ),
    );

    const batch = useLibraryBatchActions({
      selectedRecords,
      clearSelection: (records) =>
        selection.clear(records.map((record) => record.id)),
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

    function handleAction(
      action: HighlightItemAction,
      record: MyZRecord,
      event?: MouseEvent,
    ) {
      switch (action) {
        case "copy":
          void highlightsStore.copyHighlight(record.id);
          break;
        case "delete":
          void deleteStore.requestDelete([record], {
            reload: () => highlightsStore.refreshHighlights(),
            event,
          });
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
        stickyLayout={false}
        view={uiStore.view}
        pageSortMode={uiStore.pageSortMode}
        onSetView={uiStore.setView}
        onSetPageSortMode={uiStore.setPageSortMode}
        onTogglePageSidebar={props.onOpenNav}
        onClearPageFilter={uiStore.clearPageFilter}
        onExport={(format) => {
          void highlightsStore.handleExport(format);
        }}
      >
        {{
          search: () => (
            <QuickSearch
              class="max-w-xs"
              quickSearch={uiStore.quickSearch}
              availableTags={highlightsStore.availableTags}
              availableSites={highlightsStore.availableSites}
              onApplyQuickSearch={uiStore.applyQuickSearch}
              onResetFilters={uiStore.resetFilters}
            />
          ),
          default: () => (
            <div class="space-y-3">
              {selection.count.value > 0 ? (
                <SelectionBar
                  count={selection.count.value}
                  total={uiStore.filteredHighlights.length}
                  allSelected={selection.isAllSelected(visibleIds.value)}
                  onToggleAll={() => selection.toggleAll(visibleIds.value)}
                  onClear={selection.clear}
                >
                  {{
                    actions: () => (
                      <>
                        <datalist id="library-bulk-tags">
                          {highlightsStore.availableTags.map((tag) => (
                            <option key={tag} value={tag} />
                          ))}
                        </datalist>
                        <input
                          type="text"
                          list="library-bulk-tags"
                          class="h-8 w-28 rounded-control border border-line bg-surface px-2 text-caption text-text"
                          placeholder="标签"
                          aria-label="要添加的标签"
                          value={batch.bulkTag.value}
                          onInput={(event: Event) =>
                            (batch.bulkTag.value = (
                              event.target as HTMLInputElement
                            ).value)
                          }
                          onKeydown={(event: KeyboardEvent) => {
                            if (event.key === "Enter")
                              void batch.applyBulkTag();
                          }}
                        />
                        <button
                          type="button"
                          class="btn btn-small"
                          onClick={() => void batch.applyBulkTag()}
                        >
                          打标签
                        </button>
                        <select
                          class="h-8 rounded-control border border-line bg-surface px-2 text-caption text-text"
                          aria-label="导出格式"
                          value={batch.bulkExportFormat.value}
                          onChange={(event: Event) => {
                            batch.bulkExportFormat.value = (
                              event.target as HTMLSelectElement
                            ).value as "json" | "markdown";
                          }}
                        >
                          <option value="json">JSON</option>
                          <option value="markdown">Markdown</option>
                        </select>
                        <button
                          type="button"
                          class="btn btn-small"
                          onClick={() => void batch.exportSelected()}
                        >
                          导出选中
                        </button>
                        <button
                          type="button"
                          class="btn btn-small btn-danger"
                          onClick={batch.deleteSelected}
                        >
                          批量删除
                        </button>
                      </>
                    ),
                  }}
                </SelectionBar>
              ) : null}
              <HighlightGroups
                loading={highlightsStore.loadingHighlights}
                view={uiStore.view}
                groups={uiStore.groupedHighlights.map((group) => ({
                  ...group,
                  items: group.items.filter(
                    (item) => !deleteStore.isPending(item.id),
                  ),
                }))}
                hasMore={uiStore.hasMoreHighlights}
                setSentinelRef={(value) => {
                  sentinelRef.value = value as Element | null;
                }}
                formatInline={uiStore.formatInline}
                formatDateTime={uiStore.formatDateTime}
                renderHighlight={uiStore.renderHighlight}
                formatNote={uiStore.formatNote}
                onAction={handleAction}
                selectedIds={selection.selectedIds.value}
                onToggleSelect={(record) => selection.toggle(record.id)}
              />
            </div>
          ),
        }}
      </HighlightsPaneShell>
    );
  },
});
