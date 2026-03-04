import { getFromHighlightCache, focusHighlight } from "./highlight-state.ts";
import { getSelectionBoundingRect } from "./image.js";
import { useInspectorStore } from "./stores/inspector-store.ts";
import { useModalStore } from "./stores/modal-store.ts";
import { useToolbarStore } from "./stores/toolbar-store.ts";

const SCROLL_SETTLE_TIMEOUT = 1000;
const SCROLL_SETTLE_IDLE = 120;

function waitForScrollToSettle(
  timeout = SCROLL_SETTLE_TIMEOUT,
  idle = SCROLL_SETTLE_IDLE,
) {
  return new Promise<void>((resolve) => {
    let lastX = window.scrollX || 0;
    let lastY = window.scrollY || 0;
    let lastChange = performance.now();
    const startedAt = lastChange;

    const step = () => {
      const now = performance.now();
      const currentX = window.scrollX || 0;
      const currentY = window.scrollY || 0;
      if (currentX !== lastX || currentY !== lastY) {
        lastX = currentX;
        lastY = currentY;
        lastChange = now;
      }
      if (now - lastChange >= idle || now - startedAt >= timeout) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  });
}

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

export async function handleDocumentClick(event: MouseEvent) {
  const toolbarStore = useToolbarStore();
  const inspectorStore = useInspectorStore();
  const targetNode = event.target as Node | null;
  const targetElement =
    targetNode instanceof Element ? targetNode : targetNode?.parentElement;
  const highlightEl =
    targetElement?.closest?.(".myz-highlight") ||
    (event
      .composedPath?.()
      .find(
        (node) =>
          node instanceof Element && node.classList?.contains("myz-highlight"),
      ) as Element | undefined);
  if (highlightEl) {
    const el = highlightEl as HTMLElement;
    event.stopPropagation();
    const highlightId = el.dataset.highlightId;
    const record = getFromHighlightCache(highlightId);
    if (record) {
      focusHighlight(highlightId);
      await waitForScrollToSettle();
      const anchorEl = document.querySelector(
        `[data-highlight-id="${highlightId}"]`,
      ) as HTMLElement | null;
      inspectorStore.showRecord(
        record,
        (anchorEl || el).getBoundingClientRect(),
      );
    }
    return;
  }

  const targetElementFallback = targetElement as Element | null;
  const insideMyzHost =
    (targetElementFallback?.closest &&
      targetElementFallback.closest("[data-myz-host]")) ||
    (targetElementFallback?.getRootNode &&
      (targetElementFallback.getRootNode() as ShadowRoot).host &&
      (targetElementFallback.getRootNode() as ShadowRoot).host.matches?.(
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
