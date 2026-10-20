import { storeToRefs } from "pinia";
import { defineComponent, onBeforeUnmount, onMounted, watch } from "vue";
import PdfInspector from "./components/PdfInspector.js";
import PdfLanding from "./components/PdfLanding.js";
import PdfSelectionToolbar from "./components/PdfSelectionToolbar.js";
import PdfSidebar from "./components/PdfSidebar.js";
import PdfStage from "./components/PdfStage.js";
import PdfToolbar from "./components/PdfToolbar.js";
import { useReaderStore, type SidebarTab } from "./stores/reader-store.js";
import { subscribeRefresh } from "@/messaging/changeRefresh";

/**
 * Reader shell. Owns nothing but composition + the `window.__MYZ_PDF__` test
 * backdoor; all state and engine logic lives in `useReaderStore`.
 */
export default defineComponent({
  name: "PdfReaderApp",
  setup() {
    const store = useReaderStore();
    const { status, error } = storeToRefs(store);

    let unsubscribe: (() => void) | null = null;
    let pendingRefresh = false;

    /** Reload annotations, deferring while an annotation edit is open. */
    function refreshFromRemote() {
      if (status.value !== "ready") return;
      if (store.activeId) {
        pendingRefresh = true;
        return;
      }
      pendingRefresh = false;
      void store.reloadAnnotations();
    }

    onMounted(() => {
      void store.init();
      window.addEventListener("keydown", handleKeydown);
      // Pick up records applied by a sync or another tab, but never clobber an
      // annotation the user is editing.
      unsubscribe = subscribeRefresh(["records", "sync"], refreshFromRemote);
      // Run a refresh that was deferred while editing once the edit closes.
      watch(
        () => store.activeId,
        (id) => {
          if (!id && pendingRefresh) refreshFromRemote();
        },
      );
    });
    onBeforeUnmount(() => {
      window.removeEventListener("keydown", handleKeydown);
      unsubscribe?.();
    });

    function handleKeydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        if (store.activeId) {
          store.activeId = null;
        } else if (store.sidebarOpen) {
          store.sidebarOpen = false;
        }
        return;
      }
      if (status.value === "landing" || status.value === "loading") return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        void store.goToPage(store.page + 1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        void store.goToPage(store.page - 1);
      }
    }

    const backdoor = {
      openUrl: store.openWeb,
      openBytes: store.openBytes,
      goToPage: store.goToPage,
      openLocal: store.openLocal,
      zoomIn: store.zoomIn,
      zoomOut: store.zoomOut,
      selectText: store.selectTextForTest,
      createAnnotation: store.createAnnotation,
      patchActive: store.patchActive,
      deleteActive: store.deleteActive,
      focusAnnotation: store.focusAnnotation,
      getAnnotations: () => store.annotations,
      getActiveAnnotation: () => store.activeRecord,
      getOutline: () => store.outline,
      getOutlineState: () => ({
        status: store.outlineStatus,
        count: store.outlineCount,
        currentId: store.currentOutlineId,
      }),
      toggleSidebar: (open?: boolean) => {
        store.sidebarOpen =
          typeof open === "boolean" ? open : !store.sidebarOpen;
      },
      setSidebarTab: (tab: SidebarTab) => {
        store.sidebarTab = tab;
      },
      setHighlightQuery: (query: string) => {
        store.highlightQuery = query;
      },
      getSidebarState: () => ({
        open: store.sidebarOpen,
        tab: store.sidebarTab,
        outlineCount: store.outlineCount,
        currentOutlineId: store.currentOutlineId,
        highlightGroups: store.highlightGroups.length,
        filter: store.highlightFilter,
        query: store.highlightQuery,
      }),
      getState: () => store.getState(),
    };
    (window as unknown as { __MYZ_PDF__: typeof backdoor }).__MYZ_PDF__ =
      backdoor;

    return () => (
      <div
        class={"reader-app" + (status.value === "landing" ? " is-landing" : "")}
      >
        {status.value !== "landing" ? (
          <>
            <PdfToolbar />
            <PdfSidebar />
            <PdfSelectionToolbar />
            <PdfInspector />
          </>
        ) : null}
        <PdfStage />

        {status.value === "loading" ? (
          <p class="reader-status">加载中…</p>
        ) : null}
        {status.value === "error" ? (
          <div class="reader-status reader-status--error">
            <span>{error.value}</span>
            {store.pendingOpen ? (
              <button
                type="button"
                class="reader-status__retry"
                onClick={() => void store.retryPendingOpen()}
              >
                重新授权并打开
              </button>
            ) : null}
          </div>
        ) : null}

        {status.value === "landing" ? <PdfLanding /> : null}
      </div>
    );
  },
});
