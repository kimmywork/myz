/**
 * Delete flow for the content inspector: in-page confirmation for records that
 * carry a note, plus the deferred delete with an undo toast for every record.
 *
 * Kept out of `Inspector.tsx` so the component stays a presentational shell and
 * the two concerns (anchored confirm popup, delayed storage write) can be read
 * one at a time.
 */
import type { MyZRecord } from "@myz/shared/types";
import { computed, nextTick, ref } from "vue";
import type { Ref } from "vue";
import {
  createPendingDelete,
  PENDING_DELETE_WINDOW_MS,
} from "../highlight/pending-delete.js";
import {
  applyHighlight,
  deleteHighlight,
  getFromHighlightCache,
  rebuildHighlightRange,
  removeHighlightFromDom,
  updateHighlightIndicators,
} from "../highlight-state.js";
import { useNotificationStore } from "../stores/notification-store.js";

/** Width of the in-page delete confirmation (§4.18 popup). */
export const CONFIRM_WIDTH = 240;
/** Gap between the delete button / panel edge and the confirmation. */
const CONFIRM_GAP = 8;

export interface InspectorDeleteOptions {
  inspectorRef: Ref<HTMLElement | null>;
  deleteButtonRef: Ref<HTMLElement | null>;
  isVisible: Ref<boolean>;
  currentRecordId: () => string | null;
  hasNote: () => boolean;
  hide: () => void;
  suspendFocusTrap: () => void;
  resumeFocusTrap: (initialFocus?: HTMLElement | null) => void;
}

interface DeferredDelete {
  start: (record: MyZRecord) => void;
  dispose: () => void;
}

/**
 * Takes the record out of the live DOM now and writes the delete only when the
 * undo window expires. Undo therefore restores the DOM from a storage record
 * that was never touched.
 */
function createDeferredDelete(hide: () => void): DeferredDelete {
  const notificationStore = useNotificationStore();

  function restoreRecord(target: MyZRecord) {
    const restored = applyHighlight(target) || rebuildHighlightRange(target);
    if (restored) updateHighlightIndicators();
    return restored;
  }

  const pendingDelete = createPendingDelete({
    windowMs: PENDING_DELETE_WINDOW_MS,
    commit: (id) => deleteHighlight(id),
    restore: (target) => restoreRecord(target),
    onCommitFailed: () => {
      notificationStore.notify({ message: "删除失败，划线没有删除" });
    },
    onUndone: (_target, restored) => {
      if (!restored) {
        notificationStore.notify({ message: "已撤销删除，刷新页面后可见" });
      }
    },
  });

  function start(target: MyZRecord) {
    removeHighlightFromDom(target.id);
    updateHighlightIndicators();
    hide();
    pendingDelete.schedule(target);
    notificationStore.notify({
      message: "已删除划线",
      duration: PENDING_DELETE_WINDOW_MS,
      action: {
        label: "撤销",
        onClick: () => {
          pendingDelete.undo(target.id);
        },
      },
    });
  }

  return { start, dispose: () => pendingDelete.dispose() };
}

export function useInspectorDelete(options: InspectorDeleteOptions) {
  const deferred = createDeferredDelete(options.hide);
  const confirmOpen = ref(false);
  const confirmPosition = ref<{ top: number; left: number } | null>(null);

  const confirmStyle = computed(() => {
    const position = confirmPosition.value;
    if (!position) {
      return undefined;
    }
    return {
      position: "fixed" as const,
      top: `${position.top}px`,
      left: `${position.left}px`,
    };
  });

  /** Anchors the popup under the delete button, right edges aligned. */
  function measureConfirm() {
    const button = options.deleteButtonRef.value?.getBoundingClientRect();
    const panel = options.inspectorRef.value?.getBoundingClientRect();
    if (!button || !panel) {
      confirmPosition.value = null;
      return;
    }
    const maxLeft = window.innerWidth - CONFIRM_WIDTH - CONFIRM_GAP;
    confirmPosition.value = {
      top: button.bottom + CONFIRM_GAP,
      left: Math.max(
        CONFIRM_GAP,
        Math.min(panel.right - CONFIRM_WIDTH, maxLeft),
      ),
    };
  }

  function openConfirm() {
    measureConfirm();
    // The inspector's trap would swallow the focus move; hand it to the popup
    // and restore it to the delete button when the popup closes.
    options.suspendFocusTrap();
    options.deleteButtonRef.value?.focus();
    confirmOpen.value = true;
  }

  async function closeConfirm() {
    if (!confirmOpen.value) return;
    confirmOpen.value = false;
    await nextTick();
    if (options.isVisible.value) {
      options.resumeFocusTrap(options.deleteButtonRef.value);
    }
  }

  function currentRecord() {
    const id = options.currentRecordId();
    return id ? getFromHighlightCache(id) : undefined;
  }

  function handleDelete() {
    const cached = currentRecord();
    if (!cached) return;
    // Confirmation and undo would guard twice: only a note can be lost.
    if (options.hasNote()) {
      openConfirm();
      return;
    }
    deferred.start(cached);
  }

  function handleConfirm() {
    const cached = currentRecord();
    confirmOpen.value = false;
    if (cached) deferred.start(cached);
  }

  return {
    confirmOpen,
    confirmStyle,
    handleDelete,
    handleConfirm,
    closeConfirm,
    dispose: deferred.dispose,
  };
}
