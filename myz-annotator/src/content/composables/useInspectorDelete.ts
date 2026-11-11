/**
 * Delete flow for the content inspector: in-page confirmation for records that
 * carry a note, plus the deferred delete with an undo toast for every record.
 *
 * Kept out of `Inspector.tsx` so the component stays a presentational shell and
 * the two concerns (anchored confirm popup, delayed storage write) can be read
 * one at a time.
 */
import { DELETE_UNDO_WINDOW_MS } from "@myz/core/delete-session";
import type { MyZRecord } from "@myz/shared/types";
import { computed, nextTick, ref } from "vue";
import type { Ref } from "vue";
import {
  applyHighlight,
  getFromHighlightCache,
  rebuildHighlightRange,
  removeHighlightFromDom,
  updateHighlightIndicators,
} from "../highlight-state.js";
import {
  useNotificationStore,
  type NotificationHandle,
} from "../stores/notification-store.js";
import { createJournalDeleteSession } from "@/messaging/delete-session";

/** Width of the in-page delete confirmation (§4.18 popup). */
export const CONFIRM_WIDTH = 240;
/** Gap between the delete button / panel edge and the confirmation. */
const CONFIRM_GAP = 8;

/** Refs and callbacks the inspector component hands to the delete flow. */
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

/** The deferred-delete half: DOM removal now, storage write later. */
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
  /** One toast per pending delete, so a commit can take its own toast down. */
  const toasts = new Map<string, NotificationHandle>();
  /** Set by the restore port; onUndone reads it right after. */
  let restoreFailed = false;

  function dismissToast(id: string) {
    const handle = toasts.get(id);
    if (!handle) return;
    toasts.delete(id);
    handle.dismiss();
  }

  function restoreRecord(target: MyZRecord) {
    const restored = applyHighlight(target) || rebuildHighlightRange(target);
    if (restored) updateHighlightIndicators();
    return restored;
  }

  const session = createJournalDeleteSession<MyZRecord>({
    windowMs: DELETE_UNDO_WINDOW_MS,
    restore: (records) => {
      restoreFailed = false;
      for (const target of records) {
        if (!restoreRecord(target)) restoreFailed = true;
      }
    },
    onCommitted: (ids) => {
      // The undo affordance died with the write; never leave it on screen.
      ids.forEach(dismissToast);
    },
    onCommitFailed: (records) => {
      records.forEach((target) => dismissToast(target.id));
      notificationStore.notify({ message: "删除失败，划线没有删除" });
    },
    onUndone: (records) => {
      records.forEach((target) => dismissToast(target.id));
      if (restoreFailed) {
        notificationStore.notify({ message: "已撤销删除，刷新页面后可见" });
      }
    },
  });

  async function start(target: MyZRecord) {
    // Persist the durable intent before the row leaves the page; if that
    // fails nothing is deleted and the row stays.
    const queued = await session.schedule([target], {
      flushPrevious: false,
    });
    if (!queued) {
      notificationStore.notify({ message: "删除失败，划线没有删除" });
      return;
    }
    removeHighlightFromDom(target.id);
    updateHighlightIndicators();
    hide();
    const handle = notificationStore.notify({
      message: "已删除划线",
      // Only the commit (or a failure) takes this toast down; a parallel
      // auto-hide timer would race with the deferred write.
      duration: DELETE_UNDO_WINDOW_MS + 5000,
      action: {
        label: "撤销",
        onClick: () => {
          void session.undo([target.id]);
        },
      },
      // Keep the commit countdown in step with the toast countdown: hovering
      // or focusing the undo button must hold the write too.
      onPause: () => session.pause(),
      onResume: () => session.resume(),
    });
    if (handle) toasts.set(target.id, handle);
  }

  return {
    start,
    dispose: () => {
      // Teardown commits: never drop a pending delete (§4.30).
      session.dispose();
      toasts.clear();
    },
  };
}

/**
 * Wires the inspector's delete button to the confirmation popup and the
 * deferred delete: opens the popup for annotated records, removes the record
 * locally, keeps the undo toast and commit timer in step, and exposes the
 * popup state the component renders off-canvas.
 *
 * @param options Refs and callbacks owned by the inspector component.
 * @returns Popup state plus the delete/confirm/cancel handlers.
 */
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
