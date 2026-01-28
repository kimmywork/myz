import { defineStore } from "pinia";
import { Ref, ref } from "vue";
import { serializeRangeToHtml, waitForNextPaint } from "../html";
import {
  cropAndDownloadSelection,
  cropToCanvas,
  getSelectionBoundingRect,
} from "../image";
import { useModalStore } from "./modal-store";
import { useNotificationStore } from "./notification-store";
import { sendMessage } from "@/shared/messaging";
import { RECORD_KINDS } from "@/shared/types";

export interface ToolbarStore {
  show(position: DOMRect): void;
  hide(): void;
  isVisible(): boolean;
  toolbarPosition: { top: string; left: string } | null;
  toolbarHeight: number;
  isJustShown(): boolean;
  toolbarRange: Range | null;
  scrollUpdateHandle: number | null;
  handleScreenshotClick(): Promise<void>;
  handleSendSelectionToAi(): Promise<void>;
  handleAnnotateClick(): void;
  handleClipClick(): void;
}

const TOOLBAR_MIN_VIEWPORT_GAP = 12;
const TOOLBAR_VERTICAL_OFFSET_RATIO = 1.5; // Keep in sync with CSS translateY percentage.

export const useToolbarStore = defineStore("toolbar", () => {
  const modalStore = useModalStore();
  const notificationStore = useNotificationStore();

  const visible = ref(false);
  const scrollUpdateHandle: Ref<number | null> = ref(null);
  const toolbarShownAt = ref(0);
  const toolbarRange = ref<Range | null>(null);

  const hide = () => {
    if (scrollUpdateHandle.value) {
      cancelAnimationFrame(scrollUpdateHandle.value);
      scrollUpdateHandle.value = null;
    }
    visible.value = false;
    toolbarShownAt.value = 0;
    toolbarRange.value = null;
  };
  const isVisible = () => {
    return visible.value;
  };

  const isJustShown = () => {
    return toolbarShownAt.value && Date.now() - toolbarShownAt.value < 250;
  };
  const toolbarHeight = ref(0);

  const toolbarPosition = ref<{ top: string; left: string } | null>(null);

  const show = (position: DOMRect) => {
    visible.value = true;
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const offsetY = toolbarHeight.value * TOOLBAR_VERTICAL_OFFSET_RATIO;
    const minTop = scrollY + TOOLBAR_MIN_VIEWPORT_GAP + offsetY;
    const topPosition = Math.max(position.top + scrollY, minTop);
    toolbarPosition.value = {
      top: `${topPosition}px`,
      left: `${position.left + scrollX + position.width / 2}px`,
    };
    toolbarShownAt.value = Date.now();
  };

  async function handleScreenshotClick() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hide();
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = getSelectionBoundingRect(range) as DOMRect;
    if (!rect || rect.width < 4 || rect.height < 4) {
      hide();
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
      hide();
    }
  }

  async function handleSendSelectionToAi() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hide();
      return;
    }
    const range = selection.getRangeAt(0);
    const rect = getSelectionBoundingRect(range) as any;
    const selectedText = selection.toString().trim();

    const fragment = range.cloneContents();
    const containsImage =
      typeof (fragment as any)?.querySelector === "function" &&
      Boolean((fragment as any).querySelector("img"));

    const storedRanges = [];
    for (let index = 0; index < selection.rangeCount; index += 1) {
      storedRanges.push(selection.getRangeAt(index).cloneRange());
    }

    selection.removeAllRanges();
    await waitForNextPaint();

    try {
      let selectionAttachment: any = null;
      if (containsImage && rect?.width > 4 && rect?.height > 4) {
        const result = await sendMessage("myz:captureSelection", { format: "png" });
        if (result?.dataUrl) {
          const crop = await cropToCanvas(result.dataUrl, rect, {
            width: window.innerWidth,
            height: window.innerHeight,
          });
          selectionAttachment = {
            type: "image",
            dataUrl: crop.canvas.toDataURL("image/png"),
            mimeType: "image/png",
            name: `selection-${Date.now()}.png`,
          };
        }
      }

      await sendMessage("myz:openSidePanelDraft", {
        action: "interpret_selection",
        prompt: "请解读选中内容",
        selectionText: selectedText,
        selectionAttachment,
        draftId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      });
    } catch (error) {
      notificationStore.notify({
        message: `打开 AI 助理失败：${(error as Error).message}`,
      });
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
      hide();
    }
  }

  function handleAnnotateClick() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hide();
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
            notificationStore.notify({
              message: "选区与已有标注重叠，无法创建新的标注。",
            });
            hide();
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
    toolbarRange.value = liveRange.cloneRange();
    modalStore.patchModalState({
      currentRange: liveRange.cloneRange(),
      currentText: selection.toString().trim(),
      currentHtml: serializeRangeToHtml(range),
      editingId: null,
      formKind: RECORD_KINDS.HIGHLIGHT,
    });
    modalStore.open({
      mode: "create",
      editingId: null,
      preview: selection.toString().trim(),
      note: "",
      tags: [],
      color: undefined,
      style: undefined,
      kind: RECORD_KINDS.HIGHLIGHT,
    });
  }

  function handleClipClick() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      hide();
      return;
    }
    const liveRange = selection.getRangeAt(0);
    toolbarRange.value = liveRange.cloneRange();
    modalStore.patchModalState({
      currentRange: liveRange.cloneRange(),
      currentText: selection.toString().trim(),
      currentHtml: serializeRangeToHtml(liveRange),
      editingId: null,
      formKind: RECORD_KINDS.CLIP,
    });
    modalStore.open({
      mode: "create",
      preview: selection.toString().trim(),
      note: "",
      tags: [],
      color: undefined,
      style: undefined,
      kind: RECORD_KINDS.CLIP,
    });
  }
  return {
    show,
    hide,
    isVisible,
    toolbarPosition,
    toolbarHeight,
    isJustShown,
    toolbarRange,
    scrollUpdateHandle,
    handleScreenshotClick,
    handleSendSelectionToAi,
    handleAnnotateClick,
    handleClipClick,
  };
});
