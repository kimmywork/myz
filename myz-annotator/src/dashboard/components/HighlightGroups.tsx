import { defineComponent, nextTick, watch } from "vue";
import { useInfiniteScroll } from "../composables/useInfiniteScroll.js";
import { useHighlightsStore } from "../stores/highlights.js";
import { useUIStore } from "../stores/ui.js";
import HighlightCard from "./HighlightCard.jsx";
import HighlightListRow from "./HighlightListRow.jsx";

export default defineComponent({
  name: "HighlightGroups",
  setup() {
    const highlightsStore = useHighlightsStore();
    const uiStore = useUIStore();

    const { sentinelRef, stop, restart } = useInfiniteScroll({
      onIntersect: () => uiStore.loadMore(),
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

    return () => {
      if (highlightsStore.loadingHighlights) {
        return (
          <section class="rounded-3xl border border-slate-200 bg-white/80 p-8 text-center text-sm text-slate-500 dark:border-white/5 dark:bg-slate-900/40 dark:text-slate-400">
            正在加载…
          </section>
        );
      }

      if (!uiStore.visibleHighlights.length) {
        return (
          <section class="rounded-3xl border border-slate-200 bg-white/80 p-8 text-center text-sm text-slate-500 dark:border-white/5 dark:bg-slate-900/40 dark:text-slate-400">
            没有符合条件的记录。
          </section>
        );
      }

      return (
        <section class="space-y-6" data-view={uiStore.view}>
          {uiStore.groupedHighlights.map((group) => (
            <section
              key={group.date}
              class="space-y-4 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-inner dark:border-white/5 dark:bg-slate-900/40"
            >
              <h3 class="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {group.date} · 共 {group.stats.total} 条{group.detailText}
              </h3>
              <div
                class={[
                  uiStore.view === "cards"
                    ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
                    : "space-y-4",
                ].join(" ")}
              >
                {group.items.map((item) =>
                  uiStore.view === "cards" ? (
                    <HighlightCard key={item.id} record={item} />
                  ) : (
                    <HighlightListRow key={item.id} record={item} />
                  ),
                )}
              </div>
            </section>
          ))}
          {uiStore.hasMoreHighlights ? (
            <div ref={sentinelRef} class="h-8 w-full" data-role="sentinel" />
          ) : null}
        </section>
      );
    };
  },
});
