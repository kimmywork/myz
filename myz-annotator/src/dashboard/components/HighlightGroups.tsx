import { defineComponent, nextTick, watch } from "vue";
import { useInfiniteScroll } from "../composables/useInfiniteScroll.js";
import { useDashboardStore } from "../store/useDashboardStore.js";
import HighlightCard from "./HighlightCard.jsx";
import HighlightListRow from "./HighlightListRow.jsx";

export default defineComponent({
  name: "HighlightGroups",
  setup() {
    const store = useDashboardStore();

    const { sentinelRef, stop, restart } = useInfiniteScroll({
      onIntersect: () => store.loadMore(),
    });

    watch(
      () => store.hasMoreHighlights.value,
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
      () => store.view.value,
      async () => {
        await nextTick();
        restart();
      },
    );

    watch(
      () => store.visibleHighlights.value.length,
      async () => {
        await nextTick();
        restart();
      },
    );

    return () => {
      if (store.loadingHighlights.value) {
        return (
          <section class="rounded-3xl border border-slate-200 bg-white/80 p-8 text-center text-sm text-slate-500 dark:border-white/5 dark:bg-slate-900/40 dark:text-slate-400">
            正在加载…
          </section>
        );
      }

      if (!store.visibleHighlights.value.length) {
        return (
          <section class="rounded-3xl border border-slate-200 bg-white/80 p-8 text-center text-sm text-slate-500 dark:border-white/5 dark:bg-slate-900/40 dark:text-slate-400">
            没有符合条件的记录。
          </section>
        );
      }

      return (
        <section class="space-y-6" data-view={store.view.value}>
          {store.groupedHighlights.value.map((group) => (
            <section
              key={group.date}
              class="space-y-4 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-inner dark:border-white/5 dark:bg-slate-900/40"
            >
              <h3 class="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {group.date} · 共 {group.stats.total} 条{group.detailText}
              </h3>
              <div
                class={[
                  store.view.value === "cards"
                    ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
                    : "space-y-4",
                ].join(" ")}
              >
                {group.items.map((item) =>
                  store.view.value === "cards" ? (
                    <HighlightCard key={item.id} record={item} />
                  ) : (
                    <HighlightListRow key={item.id} record={item} />
                  ),
                )}
              </div>
            </section>
          ))}
          {store.hasMoreHighlights.value ? (
            <div ref={sentinelRef} class="h-8 w-full" data-role="sentinel" />
          ) : null}
        </section>
      );
    };
  },
});
