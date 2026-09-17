import { isHighlightRecord, isClipRecord } from "@myz/shared/highlightUtils";
import { sendMessage } from "@myz/shared/messaging";
import {
  deserializeRange,
  findRangeByNormalizedText,
  resolvePartialPath,
  serializeRangePaths,
  unwrapNode,
} from "@myz/shared/serializer";
import { MyZRecord } from "@myz/shared/types";
import { canonicalUrl, buildUrlAliases } from "@myz/shared/url";
import {
  wrapRangeAcrossNodes,
  wrapSimpleRange,
  decorateHighlightElement,
} from "./apply-highlight.ts";
import { useInspectorStore } from "./stores/inspector-store.ts";
import { useModalStore } from "./stores/modal-store.ts";
import { useNotificationStore } from "./stores/notification-store.ts";
import { ensureContentStyles } from "./styles.ts";
import type {
  GetAllTagsMessageResult,
  GetHighlightsForUrlMessageResult,
  RemoveHighlightMessageResult,
  UpdateHighlightMessageResult,
} from "@/background/messages/highlights";
import { normalizeRecord } from "@/dashboard/utils/records.ts";

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

const highlightCache = new Map<string, MyZRecord>();
const unreachableHighlights = new Set<string>();
const highlightReapplyState: HighlightReapplyState = {
  pending: new Set(),
  timerId: null,
  observer: null,
  deadline: 0,
  tickHandle: null,
  failureNotified: false,
  deadlineListenerAttached: false,
  deadlineListener: null,
};

export function isInHighlightCache(id: string) {
  return highlightCache.has(id);
}

export async function restoreHighlights() {
  const modalStore = useModalStore();
  const inspectorStore = useInspectorStore();
  const notificationStore = useNotificationStore();
  try {
    ensureContentStyles();
    const currentUrl = window.location.href;
    const currentCanonical = canonicalUrl(currentUrl);
    const urlAliases = buildUrlAliases(currentUrl, currentCanonical);
    const [highlights, tagList] = await Promise.all([
      sendMessage<
        { url?: string; aliases?: string[] },
        GetHighlightsForUrlMessageResult
      >("myz:getHighlightsForUrl", {
        url: currentCanonical,
        aliases: urlAliases,
      }),
      sendMessage<undefined, GetAllTagsMessageResult>("myz:getAllTags").catch(
        (error) => {
          console.warn("Failed to load known tags", error);
          return null;
        },
      ),
    ]);

    if (Array.isArray(tagList)) {
      // FIXME: modal
      modalStore.setModalKnownTags(tagList);
    }

    // FIXME: inspector
    inspectorStore.hide();
    Array.from(document.querySelectorAll(".myz-highlight")).forEach((node) =>
      unwrapNode(node),
    );
    highlightCache.clear();
    unreachableHighlights.clear();
    resetHighlightReapplyState();

    const records = Array.isArray(highlights) ? highlights : [];
    let rebuiltCount = 0;
    records.forEach((record) => {
      const stored = storeRecord(record);
      if (!stored) {
        return;
      }
      // FIXME: modal
      modalStore.addModalKnownTags(stored.tags || []);
      if (isHighlightRecord(stored) && stored.range) {
        let applied = applyHighlight(stored);
        if (!applied && rebuildHighlightRange(stored)) {
          applied = true;
          rebuiltCount += 1;
          persistRebuiltRange(stored);
        }
        if (applied) {
          unreachableHighlights.delete(stored.id);
          removeHighlightFromPending(stored.id);
        } else if (stored?.id) {
          markHighlightForReapply(stored.id);
        }
      } else if (stored?.id) {
        unreachableHighlights.delete(stored.id);
        removeHighlightFromPending(stored.id);
      }
    });
    if (rebuiltCount > 0) {
      notificationStore.notify({
        message: `已按页面内容重建 ${rebuiltCount} 条划线位置。`,
      });
    }
    // Update badge/indicators for the (current) page after restore.
    updateHighlightIndicators();
  } catch (error) {
    console.error("Failed to restore highlights", error);
    highlightCache.clear();
    unreachableHighlights.clear();
    updateHighlightIndicators();
  }
}

export function updateHighlightIndicators() {
  syncBadgeWithBackground();
}

function syncBadgeWithBackground() {
  let isTopLevel = false;
  try {
    isTopLevel = window.top === window;
  } catch (error) {
    isTopLevel = false;
  }
  if (!isTopLevel) {
    return;
  }
  const stats = computeHighlightStats();
  sendMessage("myz:updateBadge", {
    count: stats.total,
    total: stats.total,
    highlightCount: stats.highlightCount,
    savedCount: stats.savedCount,
  }).catch(() => {});
}

function computeHighlightStats() {
  let highlightCount = 0;
  let savedCount = 0;
  highlightCache.forEach((record) => {
    if (isClipRecord(record)) {
      savedCount += 1;
    } else {
      highlightCount += 1;
    }
  });
  return {
    highlightCount,
    savedCount,
    total: highlightCount + savedCount,
  };
}

function resetHighlightReapplyState() {
  highlightReapplyState.pending.clear();
  highlightReapplyState.failureNotified = false;
  cleanupHighlightReapply();
}

/**
 * Persist a range that was rebuilt from page text so later loads do not have
 * to search again. Fire-and-forget: a failure only costs a repeat search.
 */
function persistRebuiltRange(record: MyZRecord) {
  if (!record?.id || !record?.range) {
    return;
  }
  sendMessage("myz:updateHighlightRange", {
    id: record.id,
    range: record.range,
  }).catch(() => {});
}

export function removeHighlightFromPending(id: string) {
  if (!id) {
    return;
  }
  if (
    highlightReapplyState.pending.delete(id) &&
    !highlightReapplyState.pending.size
  ) {
    cleanupHighlightReapply();
  }
}

function cleanupHighlightReapply() {
  if (highlightReapplyState.timerId) {
    clearInterval(highlightReapplyState.timerId);
    highlightReapplyState.timerId = null;
  }
  if (highlightReapplyState.tickHandle) {
    clearTimeout(highlightReapplyState.tickHandle);
    highlightReapplyState.tickHandle = null;
  }
  if (highlightReapplyState.observer) {
    highlightReapplyState.observer.disconnect();
    highlightReapplyState.observer = null;
  }
  if (highlightReapplyState.deadlineListener) {
    document.removeEventListener(
      "readystatechange",
      highlightReapplyState.deadlineListener,
    );
    highlightReapplyState.deadlineListener = null;
  }
  highlightReapplyState.deadlineListenerAttached = false;
  highlightReapplyState.deadline = 0;
}

export function markHighlightForReapply(id: string) {
  if (!id) {
    return;
  }
  highlightReapplyState.pending.add(id);
  highlightReapplyState.failureNotified = false;
  scheduleHighlightReapply();
}

function scheduleHighlightReapply() {
  if (!highlightReapplyState.pending.size) {
    cleanupHighlightReapply();
    return;
  }
  ensureReapplyDeadline();
  queueHighlightReapply();
  if (!highlightReapplyState.timerId) {
    highlightReapplyState.timerId = setInterval(
      queueHighlightReapply,
      HIGHLIGHT_REAPPLY_INTERVAL,
    );
  }
  if (!highlightReapplyState.observer) {
    const target = document.body || document.documentElement;
    if (target) {
      highlightReapplyState.observer = new MutationObserver(() =>
        queueHighlightReapply(),
      );
      highlightReapplyState.observer.observe(target, {
        childList: true,
        subtree: true,
      });
    }
  }
}

function ensureReapplyDeadline() {
  if (highlightReapplyState.deadline) {
    return;
  }
  if (document.readyState === "complete") {
    highlightReapplyState.deadline = Date.now() + HIGHLIGHT_REAPPLY_TIMEOUT;
    return;
  }
  if (highlightReapplyState.deadlineListenerAttached) {
    return;
  }
  const handler = () => {
    if (document.readyState !== "complete") {
      return;
    }
    highlightReapplyState.deadline = Date.now() + HIGHLIGHT_REAPPLY_TIMEOUT;
    highlightReapplyState.deadlineListenerAttached = false;
    if (highlightReapplyState.deadlineListener) {
      document.removeEventListener(
        "readystatechange",
        highlightReapplyState.deadlineListener,
      );
      highlightReapplyState.deadlineListener = null;
    }
  };
  highlightReapplyState.deadlineListener = handler;
  highlightReapplyState.deadlineListenerAttached = true;
  document.addEventListener("readystatechange", handler);
}

function queueHighlightReapply() {
  if (!highlightReapplyState.pending.size) {
    cleanupHighlightReapply();
    return;
  }
  if (!highlightReapplyState.observer) {
    const target = document.body || document.documentElement;
    if (target) {
      highlightReapplyState.observer = new MutationObserver(() =>
        queueHighlightReapply(),
      );
      highlightReapplyState.observer.observe(target, {
        childList: true,
        subtree: true,
      });
    }
  }
  if (highlightReapplyState.tickHandle) {
    return;
  }
  highlightReapplyState.tickHandle = setTimeout(() => {
    highlightReapplyState.tickHandle = null;
    attemptHighlightReapply();
  }, 80);
}

function attemptHighlightReapply() {
  const notificationStore = useNotificationStore();
  if (!highlightReapplyState.pending.size) {
    cleanupHighlightReapply();
    return;
  }
  const pendingIds = Array.from(highlightReapplyState.pending);
  let appliedThisRound = 0;
  let rebuiltThisRound = 0;
  pendingIds.forEach((id) => {
    const record = highlightCache.get(id);
    if (!record) {
      highlightReapplyState.pending.delete(id);
      return;
    }
    let applied = applyHighlight(record);
    if (!applied && rebuildHighlightRange(record)) {
      applied = true;
      rebuiltThisRound += 1;
      persistRebuiltRange(record);
    }
    if (applied) {
      highlightReapplyState.pending.delete(id);
      unreachableHighlights.delete(id);
      appliedThisRound += 1;
    }
  });

  if (rebuiltThisRound > 0) {
    notificationStore.notify({
      message: `已按页面内容重建 ${rebuiltThisRound} 条划线位置。`,
    });
  }

  if (!highlightReapplyState.pending.size) {
    cleanupHighlightReapply();
    return;
  }

  if (appliedThisRound > 0) {
    if (document.readyState === "complete") {
      highlightReapplyState.deadline = Date.now() + HIGHLIGHT_REAPPLY_TIMEOUT;
    } else {
      highlightReapplyState.deadline = 0;
      ensureReapplyDeadline();
    }
  }

  if (
    highlightReapplyState.deadline &&
    Date.now() > highlightReapplyState.deadline
  ) {
    const failedIds = Array.from(highlightReapplyState.pending);
    const remaining = failedIds.length;
    failedIds.forEach((id) => unreachableHighlights.add(id));
    highlightReapplyState.pending.clear();
    cleanupHighlightReapply();
    if (!highlightReapplyState.failureNotified && remaining > 0) {
      highlightReapplyState.failureNotified = true;
      // Distinguish "the stored path no longer resolves" (the page DOM
      // changed) from an apply-time error, so the warning is actionable.
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
      const message =
        remaining === 1
          ? "部分划线无法定位，可能因为页面内容已改变。"
          : `有 ${remaining} 条记录无法定位，可能因为页面内容已改变。`;
      notificationStore.notify({
        message: message,
      });
    }
  }
}

/**
 * When a stored range no longer resolves, try to relocate the record by its
 * text and rewrite `record.range`. Returns true when it relocated and applied.
 */
export function rebuildHighlightRange(record: MyZRecord): boolean {
  if (!record?.text) {
    return false;
  }
  // Prefer the deepest still-valid ancestor of the stored path so the text
  // search stays close to where the highlight used to be.
  let range: Range | null = null;
  const startPath = record.range?.start?.path;
  if (startPath?.length) {
    const partial = resolvePartialPath(startPath);
    if (partial && partial !== document.body && partial.isConnected) {
      range = findRangeByNormalizedText(partial, record.text);
    }
  }
  if (!range) {
    range = findRangeByNormalizedText(document.body, record.text);
  }
  if (!range || range.collapsed) {
    return false;
  }
  const serialized = serializeRangePaths(range);
  if (!serialized) {
    return false;
  }
  record.range = serialized;
  return applyHighlight(record);
}

export function applyHighlight(record: MyZRecord) {
  if (!isHighlightRecord(record)) {
    return false;
  }
  if (!record?.range) {
    return false;
  }
  try {
    const range = deserializeRange(record.range);
    if (!range || range.collapsed) {
      return false;
    }
    removeHighlightFromDom(record.id);
    // Prefer wrapping by collecting and wrapping individual text-node
    // segments. This avoids cloning the whole fragment which can split
    // inline elements (links) and leave empty anchors when multiple
    // highlights are created in the same paragraph. Fall back to the
    // simple fragment-based wrapper if text-node wrapping doesn't apply.
    let applied = false;
    try {
      applied = wrapRangeAcrossNodes(range, record);
    } catch (e) {
      applied = false;
    }
    if (!applied) {
      applied = wrapSimpleRange(range, record);
    }
    if (applied) {
      return true;
    }
  } catch (error) {
    console.warn("Unable to apply highlight", error, record);
  }
  return false;
}

function removeHighlightFromDom(id: string) {
  const nodes = document.querySelectorAll(`[data-highlight-id="${id}"]`);
  nodes.forEach((node) => unwrapNode(node));
}

export function storeRecord(record: MyZRecord) {
  if (!record || !record.id) {
    return null;
  }
  const normalized = normalizeRecord(record)!;
  highlightCache.set(normalized.id, normalized);
  return normalized;
}

export function focusHighlight(id?: string) {
  if (!id) {
    return false;
  }
  const node = document.querySelector(`[data-highlight-id="${id}"]`);
  if (!node) {
    return false;
  }
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.classList.add("myz-highlight--flash");
  setTimeout(() => node.classList.remove("myz-highlight--flash"), 1200);
  return true;
}

export function buildHighlightStateSnapshot() {
  const unreachable = Array.from(unreachableHighlights).filter((id) =>
    highlightCache.has(id),
  );
  if (unreachable.length !== unreachableHighlights.size) {
    unreachableHighlights.clear();
    unreachable.forEach((id) => unreachableHighlights.add(id));
  }
  const stats = computeHighlightStats();
  return {
    count: stats.total,
    total: stats.total,
    highlightCount: stats.highlightCount,
    savedCount: stats.savedCount,
    unreachableIds: unreachable,
    unreachableCount: unreachable.length,
  };
}

export async function updateExistingHighlight(update: Partial<MyZRecord>) {
  const modalStore = useModalStore();
  const inspectorStore = useInspectorStore();
  try {
    const record = await sendMessage<
      Partial<MyZRecord>,
      UpdateHighlightMessageResult
    >("myz:updateHighlight", update);
    if (!record) {
      return;
    }
    const stored = storeRecord(record);
    if (!stored) {
      return;
    }
    modalStore.addModalKnownTags(stored.tags || []);
    if (isHighlightRecord(stored)) {
      const nodes = document.querySelectorAll(
        `[data-highlight-id="${stored.id}"]`,
      );
      nodes.forEach((node) => {
        decorateHighlightElement(node as HTMLElement, stored);
      });
    } else {
      removeHighlightFromDom(stored.id);
      unreachableHighlights.delete(stored.id);
      removeHighlightFromPending(stored.id);
    }
    if (inspectorStore.isInspecting(stored.id)) {
      inspectorStore.showRecord(stored);
    }
    updateHighlightIndicators();
  } catch (error) {
    console.error("Failed to update highlight", error);
  }
}

export async function deleteHighlight(id: string) {
  const inspectorStore = useInspectorStore();
  try {
    await sendMessage<{ id?: string }, RemoveHighlightMessageResult>(
      "myz:removeHighlight",
      { id },
    );
    highlightCache.delete(id);
    removeHighlightFromPending(id);
    unreachableHighlights.delete(id);
    removeHighlightFromDom(id);
    if (inspectorStore.isInspecting(id)) {
      inspectorStore.hide();
    }
    updateHighlightIndicators();
  } catch (error) {
    console.error("Failed to delete highlight", error);
  }
}

export function deleteUnreachableHighlights(id: string) {
  if (!id && !unreachableHighlights.has(id)) {
    return;
  }
  unreachableHighlights.delete(id);
}

export function getFromHighlightCache(id?: string) {
  if (!id) {
    return undefined;
  }
  return highlightCache.get(id);
}

export function getHighlightCache() {
  return highlightCache;
}
