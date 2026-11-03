import { watch } from "vue";
import { createPdfBilingualLayer } from "../bilingual.js";
import { useBilingual } from "@/reader/translate/useBilingual.js";

/** Engine operations the bilingual mode needs to make room for its column. */
export interface PdfBilingualView {
  getScale(): number;
  setScale(scale: number): void;
  /** Scales the pages so `columns` copies fit the stage width. */
  fit(columns: number): void;
}

/**
 * PDF composition of the bilingual mode: the shared translation controller
 * (toggle, language, session) plus the page-column layer that measures blocks
 * and paints them. Enabling the mode zooms the page out so the mirrored column
 * fits beside it, and closing it restores the reader's previous zoom.
 */
export function usePdfBilingual(deps: {
  getStage: () => HTMLElement | null;
  view: PdfBilingualView;
}) {
  const controller = useBilingual("myz-pdf-bilingual");
  const layer = createPdfBilingualLayer({
    session: controller.session,
    getStage: deps.getStage,
  });
  let restoreScale: number | null = null;

  function fit() {
    if (!controller.enabled.value) return;
    // Capture the pre-fit scale here as well: when the mode starts enabled from
    // saved preferences the watcher never fires, so this is the only place that
    // sees the reader's original zoom.
    if (restoreScale === null) {
      restoreScale = deps.view.getScale();
    }
    deps.view.fit(2);
  }

  watch(controller.enabled, (enabled) => {
    if (enabled) {
      restoreScale = deps.view.getScale();
      layer.attach();
      layer.sync();
      fit();
      return;
    }
    layer.detach();
    layer.clear();
    if (restoreScale !== null) {
      deps.view.setScale(restoreScale);
      restoreScale = null;
    }
  });

  return {
    ...controller,
    attach() {
      if (controller.enabled.value) {
        layer.attach();
        layer.sync();
        fit();
      }
    },
    detach() {
      layer.detach();
    },
    /** Re-fits after a document opened while the mode was already on. */
    fit,
    pageRendered(pageEl: HTMLElement) {
      if (controller.enabled.value) {
        layer.pageRendered(pageEl);
      }
    },
  };
}

export type PdfBilingual = ReturnType<typeof usePdfBilingual>;
