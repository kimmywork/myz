import { DELETE_UNDO_WINDOW_MS } from "@myz/core/delete-session";
import type { MyZRecord } from "@myz/shared/types";
import { defineStore } from "pinia";
import { ref } from "vue";
import { createJournalDeleteSession } from "@/messaging/delete-session";
import { invoke } from "@/messaging/invoke";

/** Reload callback so a restored delete reappears in the current list. */
type Reload = () => void | Promise<void>;

interface DeleteRequestOptions {
  reload?: Reload;
  /** Click position, so the annotated-record confirm sits at the trigger. */
  event?: MouseEvent;
  /** Runs once the intent is queued (e.g. the viewer returns to the list). */
  afterSchedule?: () => void;
}

/**
 * Dashboard-wide delete flow (§4.30): one session, one inline undo bar and one
 * annotated-record confirmation, shared by Inbox, the library and the viewer.
 */
export const useDeleteStore = defineStore("delete", () => {
  const message = ref("");
  const confirmOpen = ref(false);
  const confirmPosition = ref({ top: 0, left: 0 });
  const pendingRecords = ref<MyZRecord[]>([]);
  /** Rows removed from the lists now, while the commit waits for the window. */
  const pendingIds = ref<Set<string>>(new Set());
  let reloadFn: Reload | null = null;
  let pendingAfterSchedule: (() => void) | null = null;

  function refresh() {
    void reloadFn?.();
  }

  const session = createJournalDeleteSession<MyZRecord>({
    windowMs: DELETE_UNDO_WINDOW_MS,
    restore: (records) => {
      message.value = "";
      const next = new Set(pendingIds.value);
      records.forEach((record) => next.delete(record.id));
      pendingIds.value = next;
      refresh();
    },
    onCommitted: (ids) => {
      message.value = "";
      const next = new Set(pendingIds.value);
      ids.forEach((id) => next.delete(id));
      pendingIds.value = next;
    },
    onCommitFailed: () => {
      message.value = "删除失败，记录已恢复";
      refresh();
    },
    onUndone: () => {
      message.value = "";
    },
  });

  function labelFor(records: readonly MyZRecord[]): string {
    const annotated = records.filter((record) =>
      (record.note || "").trim(),
    ).length;
    const base = `已删除 ${records.length} 条`;
    return annotated ? `${base}（含 ${annotated} 条带批注）` : base;
  }

  async function remove(
    records: readonly MyZRecord[],
    options: DeleteRequestOptions = {},
  ): Promise<boolean> {
    if (!records.length) return false;
    reloadFn = options.reload ?? reloadFn;
    const queued = await session.schedule(records);
    if (!queued) {
      message.value = "删除失败，记录已恢复";
      return false;
    }
    const next = new Set(pendingIds.value);
    records.forEach((record) => next.add(record.id));
    pendingIds.value = next;
    message.value = labelFor(records);
    options.afterSchedule?.();
    return true;
  }

  /**
   * Entry point for every dashboard delete. A single annotated record asks for
   * confirmation; everything else (including mixed batches) goes straight to
   * the undo bar, with the cost written into its copy.
   */
  function requestDelete(
    records: readonly MyZRecord[],
    options: DeleteRequestOptions = {},
  ): Promise<boolean> {
    if (!records.length) return Promise.resolve(false);
    const annotated = records.filter((record) => (record.note || "").trim());
    if (records.length === 1 && annotated.length === 1) {
      pendingRecords.value = [...records];
      reloadFn = options.reload ?? reloadFn;
      pendingAfterSchedule = options.afterSchedule ?? null;
      const x = options.event?.clientX ?? window.innerWidth / 2 - 120;
      const y = options.event?.clientY ?? window.innerHeight / 2;
      confirmPosition.value = {
        top: Math.max(8, Math.min(y + 8, window.innerHeight - 160)),
        left: Math.max(8, Math.min(x - 120, window.innerWidth - 248)),
      };
      confirmOpen.value = true;
      // The confirmation path resolves later; the caller only needs not to
      // re-enter while the popover is open.
      return Promise.resolve(true);
    }
    return remove(records, options);
  }

  /**
   * Annotated single record: confirmation replaces undo (§4.30), so this
   * commits immediately instead of opening the undo window.
   */
  async function removeNow(records: readonly MyZRecord[]) {
    if (!records.length) return;
    const ids = records.map((record) => record.id);
    let queued = false;
    try {
      queued = (
        await invoke("myz:queuePendingDelete", { ids, dueAt: Date.now() })
      ).ok;
    } catch {
      queued = false;
    }
    if (!queued) {
      message.value = "删除失败，记录已恢复";
      return;
    }
    const hidden = new Set(pendingIds.value);
    ids.forEach((id) => hidden.add(id));
    pendingIds.value = hidden;

    let committed = false;
    try {
      committed = (await invoke("myz:commitPendingDelete", { ids })).committed;
    } catch {
      committed = false;
    }
    if (committed) {
      const next = new Set(pendingIds.value);
      ids.forEach((id) => next.delete(id));
      pendingIds.value = next;
      message.value = "";
      refresh();
      return;
    }

    // The delete failed. Cancel the durable intent BEFORE refreshing, otherwise
    // the next read retries the (already due) intent and deletes the record the
    // user was told was restored.
    let cancelled = false;
    try {
      cancelled = (await invoke("myz:cancelPendingDelete", { ids })).ok;
    } catch {
      cancelled = false;
    }
    if (cancelled) {
      const next = new Set(pendingIds.value);
      ids.forEach((id) => next.delete(id));
      pendingIds.value = next;
      message.value = "删除失败，记录已恢复";
      refresh();
      return;
    }
    // Cancelling failed too: keep the rows hidden and let the intent retry.
    // Never claim "restored" when the record is still going to be deleted.
    message.value = "删除失败，稍后会重试";
  }

  function confirmDelete() {
    const records = pendingRecords.value;
    const afterSchedule = pendingAfterSchedule;
    pendingRecords.value = [];
    pendingAfterSchedule = null;
    confirmOpen.value = false;
    if (!records.length) return;
    void removeNow(records).then(() => afterSchedule?.());
  }

  function cancelDelete() {
    pendingRecords.value = [];
    pendingAfterSchedule = null;
    confirmOpen.value = false;
  }

  /** True while the row is hidden by a pending delete. */
  function isPending(id: string): boolean {
    return pendingIds.value.has(id);
  }

  function undo() {
    void session.undo();
  }

  function pause() {
    session.pause();
  }

  function resume() {
    session.resume();
  }

  /** Route change: commit pending deletes instead of dropping them. */
  function flush() {
    void session.flushAll();
    message.value = "";
  }

  let suppressNextRouteFlush = false;
  let suppressTimer: ReturnType<typeof setTimeout> | null = null;

  function clearSuppression() {
    if (suppressTimer) {
      clearTimeout(suppressTimer);
      suppressTimer = null;
    }
    suppressNextRouteFlush = false;
  }

  /**
   * Marks the programmatic navigation that follows a viewer delete. Only the
   * very next route change is skipped; a 1s fallback clears the mark so it can
   * never swallow a real user navigation.
   */
  function markDeleteNavigation() {
    clearSuppression();
    suppressNextRouteFlush = true;
    suppressTimer = setTimeout(clearSuppression, 1000);
  }

  /** Router hook: skip the delete-triggered navigation, flush everything else. */
  function flushOnRouteChange() {
    if (suppressNextRouteFlush) {
      clearSuppression();
      return;
    }
    flush();
  }

  /** Page teardown: commits; the durable intent covers a killed page. */
  function teardown() {
    session.dispose();
    message.value = "";
  }

  return {
    message,
    confirmOpen,
    confirmPosition,
    pendingRecords,
    pendingIds,
    isPending,
    remove,
    removeNow,
    requestDelete,
    confirmDelete,
    cancelDelete,
    undo,
    pause,
    resume,
    flush,
    markDeleteNavigation,
    flushOnRouteChange,
    teardown,
  };
});
