import { storeToRefs } from "pinia";
import { defineComponent, onMounted } from "vue";
import PdfInspector from "./components/PdfInspector.js";
import PdfLanding from "./components/PdfLanding.js";
import PdfSelectionToolbar from "./components/PdfSelectionToolbar.js";
import PdfSidebar from "./components/PdfSidebar.js";
import PdfStage from "./components/PdfStage.js";
import PdfToolbar from "./components/PdfToolbar.js";
import { useReaderStore, type SidebarTab } from "./stores/reader-store.js";

/**
 * Reader shell. Owns nothing but composition + the `window.__MYZ_PDF__` test
 * backdoor; all state and engine logic lives in `useReaderStore`.
 */
export default defineComponent({
  name: "PdfReaderApp",
  setup() {
    const store = useReaderStore();
    const { status, error } = storeToRefs(store);

    onMounted(() => {
      void store.init();
    });

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
      <div class="reader-app">
        <PdfToolbar />
        <PdfStage />
        <PdfSidebar />
        <PdfSelectionToolbar />
        <PdfInspector />

        {status.value === "loading" ? (
          <p class="reader-status">加载中…</p>
        ) : null}
        {status.value === "error" ? (
          <p class="reader-status reader-status--error">{error.value}</p>
        ) : null}

        {status.value === "landing" ? <PdfLanding /> : null}
      </div>
    );
  },
});
