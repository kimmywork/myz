import { nextTick, watch } from "vue";
import { createEpubBilingualLayer } from "../bilingual.js";
import { useBilingual } from "@/reader/translate/useBilingual.js";

/**
 * EPUB composition of the bilingual mode: the shared translation controller
 * plus the chapter-mirroring column. The frame composable feeds the loaded
 * document and its scroll offset; the store exposes the rest to the toolbar.
 */
export function useEpubBilingual() {
  const controller = useBilingual("myz-epub-bilingual");
  const layer = createEpubBilingualLayer({
    session: controller.session,
    container: () =>
      document.querySelector<HTMLElement>(".epub-bilingual__content"),
    scrollHost: () => document.querySelector<HTMLElement>(".epub-bilingual"),
  });

  watch(controller.enabled, (enabled) => {
    if (!enabled) {
      layer.clear();
      return;
    }
    // The iframe has just been narrowed to make room for the column; wait one
    // frame so the reflowed geometry is what gets measured.
    void nextTick(() => {
      window.requestAnimationFrame(() => layer.refresh());
    });
  });

  return {
    ...controller,
    setFrame(doc: Document, win: Window) {
      // Always bind: the user can switch the mode on after the chapter loaded.
      layer.bind(doc, win);
      if (controller.enabled.value) {
        layer.refresh();
      }
    },
    syncScroll() {
      if (controller.enabled.value) {
        layer.syncScroll();
      }
    },
    refresh() {
      if (controller.enabled.value) {
        layer.refresh();
      }
    },
    clear() {
      layer.clear();
    },
  };
}

export type EpubBilingual = ReturnType<typeof useEpubBilingual>;
