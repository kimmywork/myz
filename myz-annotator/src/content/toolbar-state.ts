import { getFromHighlightCache, focusHighlight } from "./highlight-state.ts";
import { getSelectionBoundingRect } from "./image.js";
import { useInspectorStore } from "./stores/inspector-store.ts";
import { useModalStore } from "./stores/modal-store.ts";
import { useToolbarStore } from "./stores/toolbar-store.ts";

export function maybeShowToolbarForActiveSelection() {
  try {
    const toolbarStore = useToolbarStore();
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }
    const text = selection.toString().trim();
    if (!text) {
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = getSelectionBoundingRect(range) as DOMRect;
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      return;
    }
    toolbarStore.toolbarRange = range.cloneRange();
    toolbarStore.show(rect);
  } catch (error) {
    // Ignore selection errors (e.g. if no range is available).
  }
}

export function handleSelectionTrigger(event: MouseEvent | KeyboardEvent) {
  const toolbarStore = useToolbarStore();
  const modalStore = useModalStore();
  if (modalStore.isVisible) {
    return;
  }
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    toolbarStore.hide();
    return;
  }
  const range = selection.getRangeAt(0);
  const rect = getSelectionBoundingRect(range) as DOMRect;
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    toolbarStore.hide();
    return;
  }
  toolbarStore.toolbarRange = range.cloneRange();
  toolbarStore.show(rect);
}

export function handleDocumentClick(event: MouseEvent) {
  const toolbarStore = useToolbarStore();
  const inspectorStore = useInspectorStore();
  const highlightEl = (event.target as Element).closest(".myz-highlight");
  if (highlightEl) {
    const el = highlightEl as HTMLElement;
    event.stopPropagation();
    const highlightId = el.dataset.highlightId;
    const record = getFromHighlightCache(highlightId);
    if (record) {
      inspectorStore.showRecord(record);
      focusHighlight(highlightId);
    }
    return;
  }

  const targetNode = event.target as Element;
  const insideMyzHost =
    (targetNode?.closest && targetNode.closest("[data-myz-host]")) ||
    (targetNode?.getRootNode &&
      (targetNode.getRootNode() as ShadowRoot).host &&
      (targetNode.getRootNode() as ShadowRoot).host.matches?.(
        "[data-myz-host]",
      ));
  if (insideMyzHost) {
    return;
  }

  if (toolbarStore.isJustShown()) {
    return;
  }

  toolbarStore.hide();
}

export function handleScrollWhileSelecting() {
  const toolbarStore = useToolbarStore();
  const modalStore = useModalStore();
  if (toolbarStore.scrollUpdateHandle) {
    cancelAnimationFrame(toolbarStore.scrollUpdateHandle);
  }
  toolbarStore.scrollUpdateHandle = requestAnimationFrame(() => {
    toolbarStore.scrollUpdateHandle = null;
    if (!toolbarStore.isVisible()) {
      return;
    }
    if (modalStore.isVisible) {
      return;
    }
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      toolbarStore.toolbarRange = selection.getRangeAt(0).cloneRange();
    }
    const range = toolbarStore.toolbarRange;
    if (!range) {
      toolbarStore.hide();
      return;
    }
    const rect = getSelectionBoundingRect(range) as DOMRect;
    if (!rect) {
      toolbarStore.hide();
      return;
    }
    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight || 0;
    const outsideViewport =
      rect.bottom < 0 ||
      rect.top > viewportHeight ||
      rect.right < 0 ||
      rect.left > viewportWidth;
    if (outsideViewport) {
      toolbarStore.hide();
      return;
    }
    toolbarStore.show(rect);
  });
}

export function updateToolbarRange(newRange: Range) {
  const toolbarStore = useToolbarStore();
  toolbarStore.toolbarRange = newRange.cloneRange();
}
