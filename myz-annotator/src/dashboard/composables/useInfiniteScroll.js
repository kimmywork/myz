import { onBeforeUnmount, onMounted, ref, watch } from "vue";

export function useInfiniteScroll(options = {}) {
  const {
    rootSelector = "main",
    sentinelSelector = '.scroll-sentinel[data-role="sentinel"]',
    rootMargin = "0px 0px 200px 0px",
    onIntersect,
    watchTargetSelector = ".highlight-groups",
    watchTarget = null,
  } = options;

  const sentinelRef = ref(null);
  let observer = null;
  let mutationObserver = null;

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
