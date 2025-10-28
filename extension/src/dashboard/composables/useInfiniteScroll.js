import { onBeforeUnmount, onMounted } from "vue";

export function useInfiniteScroll(containerSelector, onIntersect) {
  let observer = null;

  function setupObserver() {
    const root = document.querySelector(containerSelector);
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onIntersect();
        }
      },
      {
        root: root || null,
        rootMargin: "0px 0px 200px 0px"
      }
    );
  }

  function observe() {
    if (!observer) {
      setupObserver();
    }
    const sentinel = document.querySelector(".scroll-sentinel[data-role='sentinel']");
    if (observer && sentinel) {
      observer.observe(sentinel);
    }
  }

  function disconnect() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  onMounted(() => {
    setupObserver();
    observe();
    const observerConfig = { childList: true, subtree: true };
    const target = document.querySelector(".highlight-groups");
    const mutationObserver = new MutationObserver(() => {
      disconnect();
      setupObserver();
      observe();
    });
    if (target) {
      mutationObserver.observe(target, observerConfig);
    }
    window.__myzMutationObserver = mutationObserver;
  });

  onBeforeUnmount(() => {
    disconnect();
    window.__myzMutationObserver?.disconnect();
    delete window.__myzMutationObserver;
  });
}
