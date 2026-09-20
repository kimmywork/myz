import { sendMessage } from "@myz/shared/messaging";
import {
  DEFAULT_COLORS,
  HIGHLIGHT_STYLE_OPTIONS,
  HIGHLIGHT_STYLES,
} from "@myz/shared/types";
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { countPageAnnotations } from "../annotations.js";
import { usePdfAnnotations } from "../composables/usePdfAnnotations.js";
import { usePdfDocument } from "../composables/usePdfDocument.js";
import { usePdfEngine } from "../composables/usePdfEngine.js";
import { usePdfOutline } from "../composables/usePdfOutline.js";
import { sourceKeyOf } from "../source.js";
import { createReaderState, SIDEBAR_STORAGE_KEY } from "./state.js";
import type { SidebarTab } from "./state.js";

export type {
  HighlightFilter,
  OutlineStatus,
  ReaderStatus,
  SidebarTab,
} from "./state.js";

export const STYLE_OPTIONS = Object.values(HIGHLIGHT_STYLE_OPTIONS).map(
  (option) => ({
    style: option.icon as HIGHLIGHT_STYLES,
    label: option.label,
  }),
);

/**
 * Thin composition root: creates the pure state slice and wires the engine,
 * annotations, outline and document composables. All heavy logic lives in the
 * composables; the store only exposes state, selectors and actions.
 */
export const useReaderStore = defineStore("pdf-reader", () => {
  const state = createReaderState();

  const engine = usePdfEngine(state);
  const annotations = usePdfAnnotations(state, {
    pageElements: engine.pageElements,
    getStage: engine.getStage,
    getDoc: engine.getDoc,
    getCurrent: engine.getCurrent,
    goToPage: engine.goToPage,
  });
  engine.setAfterRender((el) => annotations.renderPage(el));

  const outline = usePdfOutline(state, {
    goToPage: engine.goToPage,
    getDoc: engine.getDoc,
  });

  const documentApi = usePdfDocument(state, { engine, annotations, outline });

  watch(state.activeId, () => {
    const record = annotations.activeRecord.value;
    state.noteDraft.value = record?.note || "";
    state.tagsDraft.value = [...(record?.tags || [])];
    state.dirty.value = false;
    state.savedAt.value = null;
  });

  watch([state.sidebarOpen, state.sidebarTab], persistSidebarPrefs);

  function persistSidebarPrefs() {
    try {
      localStorage.setItem(
        SIDEBAR_STORAGE_KEY,
        JSON.stringify({
          open: state.sidebarOpen.value,
          tab: state.sidebarTab.value,
        }),
      );
    } catch {
      // ignore storage failures
    }
  }

  function loadSidebarPrefs() {
    try {
      const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as { open?: boolean; tab?: SidebarTab };
      state.sidebarOpen.value = Boolean(parsed.open);
      if (parsed.tab === "outline" || parsed.tab === "highlights") {
        state.sidebarTab.value = parsed.tab;
      }
    } catch {
      // ignore malformed preferences
    }
  }

  const colorPalette = ref<string[]>([...DEFAULT_COLORS]);

  async function loadColorPalette() {
    try {
      const settings = await sendMessage<undefined, { colorPalette?: unknown }>(
        "myz:getSettings",
      );
      const palette = settings?.colorPalette;
      if (Array.isArray(palette) && palette.length) {
        const normalized = palette.filter(
          (color): color is string =>
            typeof color === "string" && Boolean(color.trim()),
        );
        if (normalized.length) {
          colorPalette.value = normalized;
        }
      }
    } catch {
      // Keep the bundled default palette when settings are unavailable.
    }
  }

  function attachStage(el: HTMLElement | null) {
    engine.attachStage(el);
    annotations.attachStage(el);
  }

  function detachStage() {
    engine.detachStage();
    annotations.detachStage();
  }

  async function init() {
    loadSidebarPrefs();
    void loadColorPalette();
    await documentApi.init();
  }

  function getState() {
    const current = engine.getCurrent();
    const stage = engine.getStage();
    const firstPage = engine.pageElements()[0] ?? document.createElement("div");
    return {
      status: state.status.value,
      page: state.page.value,
      pages: state.pages.value,
      label: state.label.value,
      rendered: engine.getRenderedCount(),
      persistedPage: state.persistedPage.value,
      scale: state.scale.value,
      sourceKey: current ? sourceKeyOf(current) : null,
      annotationCount: state.annotations.value.length,
      activeId: state.activeId.value,
      sidebarOpen: state.sidebarOpen.value,
      sidebarTab: state.sidebarTab.value,
      outlineCount: outline.outlineCount.value,
      selectionActive: Boolean(state.selection.value),
      visibleOverlays: stage
        ? countPageAnnotations(firstPage, state.annotations.value)
        : 0,
    };
  }

  return {
    ...state,
    styleOptions: STYLE_OPTIONS,
    colorPalette,
    activeRecord: annotations.activeRecord,
    highlightCounts: annotations.highlightCounts,
    highlightGroups: annotations.highlightGroups,
    outlineCount: outline.outlineCount,
    currentOutlineId: outline.currentOutlineId,
    zoomIn: engine.zoomIn,
    zoomOut: engine.zoomOut,
    zoomPercent: engine.zoomPercent,
    goToPage: engine.goToPage,
    clearSelection: annotations.clearSelection,
    createAnnotation: annotations.createAnnotation,
    patchActive: annotations.patchActive,
    deleteActive: annotations.deleteActive,
    commitActive: annotations.commitActive,
    savedLabel: annotations.savedLabel,
    focusAnnotation: annotations.focusAnnotation,
    selectTextForTest: annotations.selectTextForTest,
    toggleOutline: outline.toggleOutline,
    goToOutline: outline.goToOutline,
    openLocal: documentApi.openLocal,
    openRecent: documentApi.openRecent,
    openWeb: documentApi.openWeb,
    openBytes: documentApi.openBytes,
    pendingOpen: documentApi.pendingOpen,
    retryPendingOpen: documentApi.retryPendingOpen,
    attachStage,
    detachStage,
    init,
    getState,
  };
});
