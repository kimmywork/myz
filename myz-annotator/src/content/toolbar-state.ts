import { createApp } from "vue";
import { sendMessage } from "../shared/messaging.ts";
import { RECORD_KINDS } from "../shared/types.ts";
import ToolbarApp from "./components/Toolbar.tsx";
import { getFromHighlightCache, focusHighlight } from "./highlight-state.ts";
import { serializeRangeToHtml } from "./html.ts";
import { getSelectionBoundingRect, cropAndDownloadSelection } from "./image.js";
import { showInspector } from "./inspector-state.ts";
import { isModalVisible, openModal, patchModalState } from "./modal-state.ts";
import { showNotification } from "./notificaton-state.ts";

import { waitForNextPaint } from "./page-state.ts";
import { createShadowHost } from "./shadow-dom.ts";

const { element: toolbar } = createToolbar();

interface ToolbarState {
  toolbarRange: Range | null;
  toolbarShownAt: number;
}

const state: ToolbarState = {
  toolbarRange: null,
  toolbarShownAt: 0,
};

let scrollUpdateHandle: number | null = null;

const TOOLBAR_MIN_VIEWPORT_GAP = 12;
const TOOLBAR_VERTICAL_OFFSET_RATIO = 1.5; // Keep in sync with CSS translateY percentage.

function createToolbar() {
  const { host, shadow, mountPoint } = createShadowHost();
  const app = createApp(ToolbarApp, {
    onAnnotate: handleAnnotateClick,
    onClip: handleClipClick,
    onCapture: handleScreenshotClick,
  });
  app.mount(mountPoint);
  const rendered = shadow.querySelector(".myz-annotator-toolbar");
  return { host, element: rendered || mountPoint };
}

function handleAnnotateClick() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    hideToolbar();
    return;
  }
  const liveRange = selection.getRangeAt(0);
  // Client-side guard: if selection intersects an existing highlight wrapper,
  // notify the user immediately and avoid opening the create modal.
  try {
    const existing = Array.from(document.querySelectorAll(".myz-highlight"));
    for (const el of existing) {
      try {
        if (liveRange.intersectsNode(el)) {
          showNotification("所选文本包含已有标注，无法创建新的标注");
          hideToolbar();
          return;
        }
      } catch (e) {
        // ignore intersection errors and continue
      }
    }
  } catch (e) {
    // ignore DOM query errors
  }
  const range = liveRange.cloneRange();
  state.toolbarRange = liveRange.cloneRange();
  patchModalState({
    currentRange: liveRange.cloneRange(),
    currentText: selection.toString().trim(),
    currentHtml: serializeRangeToHtml(range),
    editingId: null,
    formKind: RECORD_KINDS.HIGHLIGHT,
  });
  openModal({
    mode: "create",
    editingId: null,
    preview: selection.toString().trim(),
    note: "",
    tags: [],
    color: null,
    style: null,
    kind: RECORD_KINDS.HIGHLIGHT,
  });
}

function handleClipClick() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    hideToolbar();
    return;
  }
  const liveRange = selection.getRangeAt(0);
  state.toolbarRange = liveRange.cloneRange();
  patchModalState({
    currentRange: liveRange.cloneRange(),
    currentText: selection.toString().trim(),
    currentHtml: serializeRangeToHtml(liveRange),
    editingId: null,
    formKind: RECORD_KINDS.CLIP,
  });
  openModal({
    mode: "create",
    preview: selection.toString().trim(),
    note: "",
    tags: [],
    color: null,
    style: null,
    kind: RECORD_KINDS.CLIP,
  });
}

export function hideToolbar() {
  if (scrollUpdateHandle) {
    cancelAnimationFrame(scrollUpdateHandle);
    scrollUpdateHandle = null;
  }
  toolbar.classList.add("myz-hidden");
  state.toolbarShownAt = 0;
  state.toolbarRange = null;
}

export function showToolbar(rect: DOMRect) {
  const scrollY = window.scrollY || document.documentElement.scrollTop;
  const scrollX = window.scrollX || document.documentElement.scrollLeft;
  const toolbarEl = toolbar as HTMLElement;
  toolbar.classList.remove("myz-hidden");
  const toolbarHeight = toolbarEl.offsetHeight || 0;
  const offsetY = toolbarHeight * TOOLBAR_VERTICAL_OFFSET_RATIO;
  const minTop = scrollY + TOOLBAR_MIN_VIEWPORT_GAP + offsetY;
  const topPosition = Math.max(rect.top + scrollY, minTop);
  toolbarEl.style.top = `${topPosition}px`;
  toolbarEl.style.left = `${rect.left + scrollX + rect.width / 2}px`;
  state.toolbarShownAt = Date.now();
}

export function maybeShowToolbarForActiveSelection() {
  try {
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
    state.toolbarRange = range.cloneRange();
    showToolbar(rect);
  } catch (error) {
    // Ignore selection errors (e.g. if no range is available).
  }
}

export function handleSelectionTrigger(event: MouseEvent | KeyboardEvent) {
  if (isModalVisible()) {
    return;
  }
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    hideToolbar();
    return;
  }
  const range = selection.getRangeAt(0);
  const rect = getSelectionBoundingRect(range) as DOMRect;
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    hideToolbar();
    return;
  }
  state.toolbarRange = range.cloneRange();
  showToolbar(rect);
}

export function handleDocumentClick(event: MouseEvent) {
  const highlightEl = (event.target as Element).closest(".myz-highlight");
  if (highlightEl) {
    const el = highlightEl as HTMLElement;
    event.stopPropagation();
    const highlightId = el.dataset.highlightId;
    const record = getFromHighlightCache(highlightId);
    if (record) {
      showInspector(record);
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

  if (state.toolbarShownAt && Date.now() - state.toolbarShownAt < 250) {
    return;
  }

  hideToolbar();
}

export function handleScrollWhileSelecting() {
  if (scrollUpdateHandle) {
    cancelAnimationFrame(scrollUpdateHandle);
  }
  scrollUpdateHandle = requestAnimationFrame(() => {
    scrollUpdateHandle = null;
    if (toolbar.classList.contains("myz-hidden")) {
      return;
    }
    if (isModalVisible()) {
      return;
    }
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      state.toolbarRange = selection.getRangeAt(0).cloneRange();
    }
    const range = state.toolbarRange;
    if (!range) {
      hideToolbar();
      return;
    }
    const rect = getSelectionBoundingRect(range) as DOMRect;
    if (!rect) {
      hideToolbar();
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
      hideToolbar();
      return;
    }
    showToolbar(rect);
  });
}

async function handleScreenshotClick() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    hideToolbar();
    return;
  }
  const range = selection.getRangeAt(0);
  const rect = getSelectionBoundingRect(range) as DOMRect;
  if (!rect || rect.width < 4 || rect.height < 4) {
    hideToolbar();
    return;
  }

  const storedRanges = [];
  for (let index = 0; index < selection.rangeCount; index += 1) {
    storedRanges.push(selection.getRangeAt(index).cloneRange());
  }

  selection.removeAllRanges();
  await waitForNextPaint();

  try {
    const result = await sendMessage("myz:captureSelection", {
      format: "png",
    });
    if (!result || !result.dataUrl) {
      return;
    }
    await cropAndDownloadSelection(result.dataUrl, rect, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
  } catch (error) {
    console.error("Selection capture failed", error);
  } finally {
    try {
      selection.removeAllRanges();
      storedRanges.forEach((storedRange) => {
        try {
          selection.addRange(storedRange);
        } catch (restoreError) {
          console.warn("Failed to restore selection range", restoreError);
        }
      });
    } catch (restoreError) {
      console.warn("Unable to restore selection", restoreError);
    }
    hideToolbar();
  }
}

export function updateToolbarRange(newRange: Range) {
  state.toolbarRange = newRange.cloneRange();
}
