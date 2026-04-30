import { onBeforeUnmount, onMounted, ref, watch } from "vue";

export interface InfiniteScrollOptions {
  rootSelector?: string;
  rootMargin?: string;
  onIntersect?: () => void;
  watchTargetSelector?: string;
  watchTarget?: HTMLElement | null;
}

export function useInfiniteScroll(options: InfiniteScrollOptions = {}) {
  const {
    rootSelector = "main",
    rootMargin = "0px 0px 200px 0px",
    onIntersect,
    watchTargetSelector = ".highlight-groups",
    watchTarget = null,
  } = options;

  const sentinelRef = ref<Element | null>(null);
  let observer: IntersectionObserver | null = null;
  let mutationObserver: MutationObserver | null = null;

  function observeSentinel() {
    if (!observer || !sentinelRef.value) {
      return;
    }
    observer.observe(sentinelRef.value);
  }

  function disconnectObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function setupObserver() {
    disconnectObserver();
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onIntersect?.();
        }
      },
      {
        root: document.querySelector(rootSelector) || null,
        rootMargin,
      },
    );
    observeSentinel();
  }

  function setupMutationObserver() {
    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    const target = watchTarget || document.querySelector(watchTargetSelector);
    if (target) {
      mutationObserver = new MutationObserver(() => {
        disconnectObserver();
        setupObserver();
        observeSentinel();
      });
      mutationObserver.observe(target, { childList: true, subtree: true });
    }
  }

  function start() {
    setupObserver();
    setupMutationObserver();
  }

  function stop() {
    disconnectObserver();
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
  }

  function restart() {
    stop();
    start();
  }

  watch(sentinelRef, (newValue, oldValue) => {
    if (!observer) {
      return;
    }
    if (oldValue) {
      observer.unobserve(oldValue);
    }
    if (newValue) {
      observer.observe(newValue);
    }
  });

  onMounted(() => {
    start();
  });

  onBeforeUnmount(() => {
    stop();
  });

  return {
    sentinelRef,
    start,
    stop,
    restart,
    setupObserver,
    disconnectObserver,
  };
}
