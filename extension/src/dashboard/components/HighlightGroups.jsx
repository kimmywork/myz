import { defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useDashboardStore } from "../store/useDashboardStore.js";
import HighlightCard from "./HighlightCard.jsx";
import HighlightListRow from "./HighlightListRow.jsx";

export default defineComponent({
  name: "HighlightGroups",
  setup() {
    const store = useDashboardStore();
    const sentinelRef = ref(null);
    let observer = null;

    function observeSentinel() {
      if (!observer || !sentinelRef.value) {
        return;
      }
      observer.observe(sentinelRef.value);
    }

    function disconnectObserver() {
      if (observer) {
        observer.disconnect();
      }
    }

    function setupObserver() {
      disconnectObserver();
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            store.loadMore();
          }
        },
        {
          root: document.querySelector(".main") || null,
          rootMargin: "0px 0px 200px 0px"
        }
      );
      observeSentinel();
    }

    onMounted(() => {
      setupObserver();
    });

    onBeforeUnmount(() => {
      disconnectObserver();
      observer = null;
    });

    watch(
      () => store.hasMoreHighlights.value,
      async (hasMore) => {
        await nextTick();
        if (!hasMore) {
          disconnectObserver();
          return;
        }
        if (!observer) {
          setupObserver();
        } else {
          observeSentinel();
        }
      }
    );

    watch(
      () => store.view.value,
      async () => {
        await nextTick();
        setupObserver();
      }
    );

    watch(
      () => store.visibleHighlights.value.length,
      async () => {
        await nextTick();
        setupObserver();
      }
    );

    return () => {
      if (store.loadingHighlights.value) {
        return <section class="highlight-groups"><p class="empty-state">正在加载…</p></section>;
      }

      if (!store.visibleHighlights.value.length) {
        return <section class="highlight-groups"><p class="empty-state">没有符合条件的记录。</p></section>;
      }

      return (
        <section class="highlight-groups" data-view={store.view.value}>
          {store.groupedHighlights.value.map((group) => (
            <section key={group.date} class="group">
              <h3 class="group__title">
                {group.date} · 共 {group.stats.total} 条{group.detailText}
              </h3>
              <div class="group__list">
                {group.items.map((item) =>
                  store.view.value === "cards" ? (
                    <HighlightCard key={item.id} record={item} />
                  ) : (
                    <HighlightListRow key={item.id} record={item} />
                  )
                )}
              </div>
            </section>
          ))}
          {store.hasMoreHighlights.value ? (
            <div ref={sentinelRef} class="scroll-sentinel" data-role="sentinel" />
          ) : null}
        </section>
      );
    };
  }
});
