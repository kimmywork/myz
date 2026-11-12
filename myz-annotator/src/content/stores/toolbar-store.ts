import { RECORD_KINDS } from "@myz/shared/types";
import { defineStore } from "pinia";
import { Ref, ref } from "vue";
import type { AiComposeResult } from "../ai-compose";
import { askAiAboutSelection } from "../ask-ai";
import { stageCapturedImage, copyImageToClipboard } from "../capture-media";
import { selectionContextText } from "../context-text";
import { serializeRangeToHtml, waitForNextPaint } from "../html";
import { cropAndDownloadSelection, getSelectionBoundingRect } from "../image";
import type { CropRect } from "../image";
import { useModalStore } from "./modal-store";
import { useNotificationStore } from "./notification-store";
import { invoke } from "@/messaging/invoke";

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
  handleAskAiClick(): Promise<void>;
  handleAnnotateClick(): void;
  handleClipClick(): void;
  handleSearchClick(): Promise<void>;
}

const TOOLBAR_MIN_VIEWPORT_GAP = 12;
const TOOLBAR_VERTICAL_OFFSET_RATIO = 1.5; // Keep in sync with CSS translateY percentage.

/**
 * User-facing toast for an AI hand-off attempt (null = stay silent).
 * `login-required` is announced by the background instead: by the time the
 * result arrives the chat tab is already in front, so a toast on this page
 * would be invisible.
 */
function describeAiResult(result: AiComposeResult): string | null {
  if (result.ok) {
    const skipped = result.skipped ?? 0;
    return skipped > 0
      ? `已填入对话，${skipped} 张图片未能附加，请检查后发送`
      : "已填入新对话，请检查后发送";
  }
  switch (result.reason) {
    case "composer-missing":
      return "未找到对话输入框，请确认对话页已加载完成";
    case "provider-unavailable":
      return "设置里的 AI 服务暂未支持，请换一个后重试";
    case "timeout":
      return "对话页响应超时，请手动打开对话页后重试";
    default:
      return null;
  }
}

function toCropRect(rect: Partial<CropRect> | null): CropRect | null {
  if (!rect) return null;
  if (
    typeof rect.left !== "number" ||
    typeof rect.top !== "number" ||
    typeof rect.width !== "number" ||
    typeof rect.height !== "number"
  ) {
    return null;
  }
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom,
  };
}

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
    const rect = toCropRect(getSelectionBoundingRect(range));
    if (!rect || rect.width < 4 || rect.height < 4) {
      hide();
      return;
    }

    const storedRanges = [];
    for (let index = 0; index < selection.rangeCount; index += 1) {
      storedRanges.push(selection.getRangeAt(index).cloneRange());
    }
    // Capture the text while the selection still exists: after the ranges are
    // cleared below it cannot be recovered, and the record needs it as context.
    const selectedText = selectionContextText(selection, range);

    selection.removeAllRanges();
    await waitForNextPaint();

    try {
      const result = await invoke("myz:captureSelection", {
        format: "png",
      });
      if (!result || !result.dataUrl) {
        return;
      }
      const cropped = await cropAndDownloadSelection(result.dataUrl, rect, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      // Copy the final card (not the expansion-only staging copy) so pasting
      // matches the downloaded image.
      const copied = await copyImageToClipboard(
        cropped.decorated.dataUrl,
        "image/png",
      );
      notificationStore.notify({
        message: copied ? "截图已复制到剪贴板" : "截图已保存，复制到剪贴板失败",
      });
      // Download happens inside cropAndDownloadSelection; stage the
      // expansion-only copy so later stitching is not affected by the
      // rounded corners or the ambient border.
      await stageCapturedImage({
        ...cropped.staged,
        sourceKind: "screenshot",
        sourceUrl: window.location.href,
        download: false,
        context: selectedText ? { text: selectedText } : undefined,
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

  /**
   * Hand the selection to the configured AI chat: the background renders the
   * prompt, opens (or focuses) the chat tab and fills its composer, so the only
   * feedback here is a toast. The toolbar hides immediately — the user is about
   * to switch tabs (or a split pane appears next to this page).
   */
  async function handleAskAiClick() {
    hide();
    try {
      const result = await askAiAboutSelection();
      if (!result) return;
      const message = describeAiResult(result);
      if (message) {
        notificationStore.notify({ message });
      }
    } catch (error) {
      console.error("AI hand-off failed", error);
      notificationStore.notify({ message: "发送到 AI 对话失败，请稍后重试" });
    }
  }

  async function handleSearchClick() {
    const selection = window.getSelection();
    const query = selection?.toString().trim() || "";
    if (!query) {
      hide();
      return;
    }
    try {
      await invoke("myz:search", { query });
    } catch (error) {
      console.error("Search failed", error);
    } finally {
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
              message: "选区与已有划线重叠，无法创建新的划线。",
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
    handleAskAiClick,
    handleAnnotateClick,
    handleClipClick,
    handleSearchClick,
  };
});
