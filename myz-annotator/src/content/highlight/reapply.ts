import { sendMessage } from "@myz/shared/messaging";
import { deserializeRange } from "@myz/shared/serializer";
import type { MyZRecord } from "@myz/shared/types";
import { useNotificationStore } from "../stores/notification-store.ts";
import { applyHighlight, rebuildHighlightRange } from "./apply.ts";
import { highlightCache, unreachableHighlights } from "./cache.ts";

const HIGHLIGHT_REAPPLY_INTERVAL = 1200;
const HIGHLIGHT_REAPPLY_TIMEOUT = 20000;

interface HighlightReapplyState {
  pending: Set<string>;
  timerId: ReturnType<typeof setInterval> | null;
  observer: MutationObserver | null;
  deadline: number;
  tickHandle: ReturnType<typeof setTimeout> | null;
  failureNotified: boolean;
  deadlineListenerAttached: boolean;
  deadlineListener: (() => void) | null;
}

const state: HighlightReapplyState = {
  pending: new Set(),
  timerId: null,
  observer: null,
  deadline: 0,
  tickHandle: null,
  failureNotified: false,
  deadlineListenerAttached: false,
  deadlineListener: null,
};

/**
 * Persist a range that was rebuilt from page text so later loads do not have
 * to search again. Fire-and-forget: a failure only costs a repeat search.
 */
export function persistRebuiltRange(record: MyZRecord) {
  if (!record?.id || !record?.range) return;
  sendMessage("myz:updateHighlightRange", {
    id: record.id,
    range: record.range,
  }).catch(() => {});
}

function cleanupHighlightReapply() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  if (state.tickHandle) {
    clearTimeout(state.tickHandle);
    state.tickHandle = null;
  }
  if (state.observer) {
    state.observer.disconnect();
    state.observer = null;
  }
  if (state.deadlineListener) {
    document.removeEventListener("readystatechange", state.deadlineListener);
    state.deadlineListener = null;
  }
  state.deadlineListenerAttached = false;
  state.deadline = 0;
}

export function resetHighlightReapplyState() {
  state.pending.clear();
  state.failureNotified = false;
  cleanupHighlightReapply();
}

function observeMutations() {
  if (state.observer) return;
  const target = document.body || document.documentElement;
  if (!target) return;
  state.observer = new MutationObserver(() => queueHighlightReapply());
  state.observer.observe(target, { childList: true, subtree: true });
}

function ensureReapplyDeadline() {
  if (state.deadline) return;
  if (document.readyState === "complete") {
    state.deadline = Date.now() + HIGHLIGHT_REAPPLY_TIMEOUT;
    return;
  }
  if (state.deadlineListenerAttached) return;
  const handler = () => {
    if (document.readyState !== "complete") return;
    state.deadline = Date.now() + HIGHLIGHT_REAPPLY_TIMEOUT;
    state.deadlineListenerAttached = false;
    if (state.deadlineListener) {
      document.removeEventListener("readystatechange", state.deadlineListener);
      state.deadlineListener = null;
    }
  };
  state.deadlineListener = handler;
  state.deadlineListenerAttached = true;
  document.addEventListener("readystatechange", handler);
}

function queueHighlightReapply() {
  if (!state.pending.size) {
    cleanupHighlightReapply();
    return;
  }
  observeMutations();
  if (state.tickHandle) return;
  state.tickHandle = setTimeout(() => {
    state.tickHandle = null;
    attemptHighlightReapply();
  }, 80);
}

function scheduleHighlightReapply() {
  if (!state.pending.size) {
    cleanupHighlightReapply();
    return;
  }
  ensureReapplyDeadline();
  queueHighlightReapply();
  if (!state.timerId) {
    state.timerId = setInterval(
      queueHighlightReapply,
      HIGHLIGHT_REAPPLY_INTERVAL,
    );
  }
  observeMutations();
}

export function removeHighlightFromPending(id: string) {
  if (!id) return;
  if (state.pending.delete(id) && !state.pending.size) {
    cleanupHighlightReapply();
  }
}

export function markHighlightForReapply(id: string) {
  if (!id) return;
  state.pending.add(id);
  state.failureNotified = false;
  scheduleHighlightReapply();
}

function reportUnreachable(failedIds: string[]) {
  const remaining = failedIds.length;
  failedIds.forEach((id) => unreachableHighlights.add(id));
  state.pending.clear();
  cleanupHighlightReapply();
  if (state.failureNotified || remaining === 0) return;
  state.failureNotified = true;
  // Distinguish "the stored path no longer resolves" (the page DOM changed)
  // from an apply-time error, so the warning is actionable.
  const stalePaths = failedIds.filter((id) => {
    const record = highlightCache.get(id);
    if (!record?.range) return true;
    try {
      return deserializeRange(record.range) === null;
    } catch {
      return true;
    }
  }).length;
  console.warn("MyZ: failed to reapply highlights", {
    remaining,
    stalePaths,
    ids: failedIds.slice(0, 30),
  });
  useNotificationStore().notify({
    message:
      remaining === 1
        ? "部分划线无法定位，可能因为页面内容已改变。"
        : `有 ${remaining} 条记录无法定位，可能因为页面内容已改变。`,
  });
}

function attemptHighlightReapply() {
  if (!state.pending.size) {
    cleanupHighlightReapply();
    return;
  }
  const pendingIds = Array.from(state.pending);
  let appliedThisRound = 0;
  let rebuiltThisRound = 0;
  pendingIds.forEach((id) => {
    const record = highlightCache.get(id);
    if (!record) {
      state.pending.delete(id);
      return;
    }
    let applied = applyHighlight(record);
    if (!applied && rebuildHighlightRange(record)) {
      applied = true;
      rebuiltThisRound += 1;
      persistRebuiltRange(record);
    }
    if (applied) {
      state.pending.delete(id);
      unreachableHighlights.delete(id);
      appliedThisRound += 1;
    }
  });

  if (rebuiltThisRound > 0) {
    useNotificationStore().notify({
      message: `已按页面内容重建 ${rebuiltThisRound} 条划线位置。`,
    });
  }

  if (!state.pending.size) {
    cleanupHighlightReapply();
    return;
  }

  if (appliedThisRound > 0) {
    if (document.readyState === "complete") {
      state.deadline = Date.now() + HIGHLIGHT_REAPPLY_TIMEOUT;
    } else {
      state.deadline = 0;
      ensureReapplyDeadline();
    }
  }

  if (state.deadline && Date.now() > state.deadline) {
    reportUnreachable(Array.from(state.pending));
  }
}
