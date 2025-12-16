import {
  wrapRangeAcrossNodes,
  wrapSimpleRange,
  decorateHighlightElement,
} from "./apply-highlight.ts";
import { useInspectorStore } from "./stores/inspector-store.ts";
import { useModalStore } from "./stores/modal-store.ts";
import { useNotificationStore } from "./stores/notification-store.ts";
import { ensureContentStyles } from "./styles.ts";
import { DEFAULT_SETTINGS } from "@/background/constants.ts";
import { ArchiveEntry } from "@/background/internetArchive.ts";
import { normalizeRecord } from "@/dashboard/utils/records.ts";
import { isHighlightRecord, isClipRecord } from "@/shared/highlightUtils.ts";
import { sendMessage } from "@/shared/messaging.ts";

import { deserializeRange, unwrapNode } from "@/shared/serializer.ts";

import { MyZRecord } from "@/shared/types.ts";
import { canonicalUrl, buildUrlAliases } from "@/shared/url.ts";

const HIGHLIGHT_REAPPLY_INTERVAL = 1200;
const HIGHLIGHT_REAPPLY_TIMEOUT = 20000;

type Settings = typeof DEFAULT_SETTINGS;

interface HightlightArchiveState {
  archiveFeatureEnabled: boolean;
  archiveDefaultOptIn: boolean;
  archiveSettingsLoaded: boolean;
  archiveStatus: any;
}

let state: HightlightArchiveState = {
  archiveFeatureEnabled: false,
  archiveDefaultOptIn: false,
  archiveSettingsLoaded: false,
  archiveStatus: null,
};

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
  try {
    ensureContentStyles();
    const currentUrl = window.location.href;
    const currentCanonical = canonicalUrl(currentUrl);
    const urlAliases = buildUrlAliases(currentUrl, currentCanonical);
    const [highlights, tagList, archiveStatus, settings] = await Promise.all([
      sendMessage("myz:getHighlightsForUrl", {
        url: currentCanonical,
        aliases: urlAliases,
      }),
      sendMessage("myz:getAllTags").catch((error) => {
        console.warn("Failed to load known tags", error);
        return null;
      }),
      sendMessage("myz:getArchiveStatusForUrl", {
        url: currentCanonical,
      }).catch((error) => {
        console.warn("Failed to load archive status", error);
        return null;
      }),
      sendMessage("myz:getSettings").catch((error) => {
        console.warn("Failed to load settings", error);
        return null;
      }),
    ]);

    applyArchivePreferences(settings, archiveStatus);

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
    records.forEach((record) => {
      const stored = storeRecord(record);
      if (!stored) {
        return;
      }
      // FIXME: modal
      modalStore.addModalKnownTags(stored.tags || []);
      if (isHighlightRecord(stored) && stored.range) {
        const applied = applyHighlight(stored);
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

function applyArchivePreferences(
  settings: Settings | undefined,
  status: ArchiveEntry,
) {
  const hasSettings = settings && typeof settings === "object";
  const enabled = hasSettings
    ? Boolean(settings.internetArchiveEnabled)
    : state.archiveFeatureEnabled;
  state.archiveFeatureEnabled = enabled;
  if (status && typeof status === "object") {
    state.archiveStatus = status;
  } else if (!enabled) {
    state.archiveStatus = null;
  }
  const saved = Boolean(state.archiveStatus?.saved);
  state.archiveDefaultOptIn = enabled && !saved;
  if (hasSettings) {
    state.archiveSettingsLoaded = true;
  }
}

function resetHighlightReapplyState() {
  highlightReapplyState.pending.clear();
  highlightReapplyState.failureNotified = false;
  cleanupHighlightReapply();
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
  pendingIds.forEach((id) => {
    const record = highlightCache.get(id);
    if (!record) {
      highlightReapplyState.pending.delete(id);
      return;
    }
    const applied = applyHighlight(record);
    if (applied) {
      highlightReapplyState.pending.delete(id);
      unreachableHighlights.delete(id);
      appliedThisRound += 1;
    }
  });

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
      console.warn("MyZ Annotator: failed to reapply highlights", {
        remaining,
      });
      const message =
        remaining === 1
          ? "部分标注无法定位，可能因为页面内容已改变。"
          : `有 ${remaining} 条标注无法定位，可能因为页面内容已改变。`;
      notificationStore.notify({
        message: message,
      });
    }
  }
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
  setTimeout(() => node.classList.remove("myz-highlight--flash"), 1400);
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
    const record = await sendMessage("myz:updateHighlight", update);
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
    await sendMessage("myz:removeHighlight", { id });
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

export function mergeArchiveResult(result: ArchiveEntry) {
  if (!result || typeof result !== "object") {
    return;
  }
  state.archiveStatus = result;
  const saved = Boolean(result.saved);
  state.archiveDefaultOptIn = state.archiveFeatureEnabled && !saved;
}

export function getArchiveState() {
  return { ...state };
}
