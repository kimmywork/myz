import { sendMessage } from "@myz/shared/messaging";
import { deserializeRange } from "@myz/shared/serializer";
import type { MyZRecord } from "@myz/shared/types";
import { useNotificationStore } from "../stores/notification-store.ts";
import { applyHighlight, rebuildHighlightRange } from "./apply.ts";
import { highlightCache, unreachableHighlights } from "./cache.ts";

const HIGHLIGHT_REAPPLY_INTERVAL = 1500;
const HIGHLIGHT_REAPPLY_TIMEOUT = 20000;

interface HighlightReapplyState {
  pending: Set<string>;
  timerId: ReturnType<typeof setInterval> | null;
  observer: MutationObserver | null;
  observedRoot: Node | null;
  deadline: number;
  tickHandle: number | null;
  tickViaIdle: boolean;
  failureNotified: boolean;
  deadlineListenerAttached: boolean;
  deadlineListener: (() => void) | null;
}

const state: HighlightReapplyState = {
  pending: new Set(),
  timerId: null,
  observer: null,
  observedRoot: null,
  deadline: 0,
  tickHandle: null,
  tickViaIdle: false,
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
  }).catch((error) => {
    // Fire-and-forget: worst case we search for the range again next load.
    console.debug("MyZ: persisting rebuilt range failed", record.id, error);
  });
}

function cleanupHighlightReapply() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  cancelScheduledTick();
  if (state.observer) {
    state.observer.disconnect();
    state.observer = null;
  }
  state.observedRoot = null;
  if (state.deadlineListener) {
    document.removeEventListener("readystatechange", state.deadlineListener);
    state.deadlineListener = null;
  }
  state.deadlineListenerAttached = false;
  state.deadline = 0;
}

function cancelScheduledTick() {
  if (state.tickHandle === null) return;
  if (state.tickViaIdle && typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(state.tickHandle);
  } else {
    window.clearTimeout(state.tickHandle);
  }
  state.tickHandle = null;
  state.tickViaIdle = false;
}

/** Schedule the next reapply attempt when the main thread is idle (RES2). */
function scheduleTick() {
  if (state.tickHandle !== null) return;
  const run = () => {
    state.tickHandle = null;
    state.tickViaIdle = false;
    attemptHighlightReapply();
  };
  if (
    typeof window !== "undefined" &&
    typeof window.requestIdleCallback === "function"
  ) {
    state.tickViaIdle = true;
    state.tickHandle = window.requestIdleCallback(run, { timeout: 200 });
  } else {
    state.tickViaIdle = false;
    state.tickHandle = window.setTimeout(run, 80);
  }
}

export function resetHighlightReapplyState() {
  state.pending.clear();
  state.failureNotified = false;
  cleanupHighlightReapply();
}

/** Ancestor chain from `node` up to (and including) the document root. */
function ancestorChain(node: Node | null): Node[] {
  const chain: Node[] = [];
  let current: Node | null = node;
  while (current) {
    chain.push(current);
    current = current.parentNode;
  }
  return chain;
}

function nearestCommonAncestor(nodes: Node[]): Node | null {
  if (!nodes.length) return null;
  let common = ancestorChain(nodes[0]);
  for (let i = 1; i < nodes.length; i += 1) {
    const chain = new Set(ancestorChain(nodes[i]));
    common = common.filter((node) => chain.has(node));
    if (!common.length) return null;
  }
  return common[0] ?? null;
}

/**
 * Narrowest subtree that still contains every pending highlight, so the
 * MutationObserver never watches the whole document when a tighter anchor is
 * available (RES2). Falls back to `document.body` when ranges are missing, not
 * yet in the DOM, or spread across the page.
 */
function resolveObservationRoot(): Node | null {
  const anchors: Node[] = [];
  for (const id of state.pending) {
    const record = highlightCache.get(id);
    if (!record?.range) continue;
    let range: Range | null = null;
    try {
      range = deserializeRange(record.range);
    } catch (error) {
      // Unresolvable ranges just widen the scope; surface for debugging.
      console.debug("MyZ: highlight anchor lookup failed", id, error);
      range = null;
    }
    const anchor = range?.commonAncestorContainer;
    if (anchor?.isConnected) anchors.push(anchor);
  }
  const common = nearestCommonAncestor(anchors);
  if (!common) return document.body || document.documentElement;
  // Watch the parent so a wholesale replacement of the anchor is still seen.
  const parent = common.parentNode;
  return parent && parent.isConnected
    ? parent
    : document.body || document.documentElement;
}

function observeMutations() {
  // Attach once per pending batch; re-resolving on every mutation callback
  // would re-walk the DOM for each pending record on busy pages.
  if (state.observer) return;
  const target = resolveObservationRoot();
  if (!target) return;
  state.observedRoot = target;
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
  scheduleTick();
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
