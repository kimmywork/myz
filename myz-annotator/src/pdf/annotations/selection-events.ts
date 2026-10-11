import type { ReaderState } from "../stores/state.js";
import {
  pageAtPoint,
  selectBlockAtPoint,
  selectByDrag,
} from "../text-selection.js";

interface SelectionEventDeps {
  getStage: () => HTMLElement | null;
  /** Recompute `state.selection` from the current DOM selection. */
  applySelection: () => void;
  /** Repaint overlays after the active annotation changes. */
  redraw: () => void;
}

/** Mouse/keyboard selection handling bound to the PDF stage. */
export function createSelectionEvents(
  state: ReaderState,
  deps: SelectionEventDeps,
) {
  let boundStage: HTMLElement | null = null;
  let dragStart: { x: number; y: number } | null = null;

  function handleMouseDown(event: MouseEvent) {
    if (event.button !== 0) {
      dragStart = null;
      return;
    }
    if ((event.target as HTMLElement)?.closest(".pdf-annotation")) {
      dragStart = null;
      return;
    }
    dragStart = { x: event.clientX, y: event.clientY };
  }

  function handleMouseUp(event: MouseEvent) {
    if ((event.target as HTMLElement)?.closest(".pdf-annotation")) return;
    const stage = deps.getStage();
    const start = dragStart;
    dragStart = null;
    if (stage) {
      const startPage = start ? pageAtPoint(stage, start.x, start.y) : null;
      // Triple-click selects the whole block (paragraph) under the pointer.
      if (event.detail === 3) {
        const page =
          pageAtPoint(stage, event.clientX, event.clientY) ?? startPage;
        if (page && selectBlockAtPoint(page, event.clientX, event.clientY)) {
          window.setTimeout(deps.applySelection, 0);
          return;
        }
      } else if (event.detail === 1 && !event.shiftKey && start && startPage) {
        // Snap a drag to the geometry-derived lines/blocks so overshooting a
        // paragraph does not bleed into the next one.
        const endPage = pageAtPoint(stage, event.clientX, event.clientY);
        if (endPage === startPage) {
          const snapped = selectByDrag(startPage, start, {
            x: event.clientX,
            y: event.clientY,
          });
          if (snapped) {
            window.setTimeout(deps.applySelection, 0);
            return;
          }
        }
      }
    }
    window.setTimeout(deps.applySelection, 0);
  }

  function handleClick(event: MouseEvent) {
    const target = (event.target as HTMLElement)?.closest(
      ".pdf-annotation",
    ) as HTMLElement | null;
    if (target?.dataset.id) {
      state.activeId.value = target.dataset.id;
      state.selection.value = null;
      deps.redraw();
    }
  }

  function handleSelectionKeyup(event: KeyboardEvent) {
    if (!event.shiftKey) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      return;
    }
    window.setTimeout(deps.applySelection, 0);
  }

  function attachStage(el: HTMLElement | null) {
    if (!el) return;
    boundStage = el;
    el.addEventListener("mousedown", handleMouseDown);
    el.addEventListener("mouseup", handleMouseUp);
    el.addEventListener("click", handleClick);
    el.addEventListener("keyup", handleSelectionKeyup);
  }

  function detachStage() {
    if (!boundStage) return;
    boundStage.removeEventListener("mousedown", handleMouseDown);
    boundStage.removeEventListener("mouseup", handleMouseUp);
    boundStage.removeEventListener("click", handleClick);
    boundStage.removeEventListener("keyup", handleSelectionKeyup);
    boundStage = null;
  }

  return { attachStage, detachStage };
}

export type SelectionEvents = ReturnType<typeof createSelectionEvents>;
