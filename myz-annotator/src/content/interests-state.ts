import {
  ElementPosition,
  collectLeafBlocks,
  normalizeParagraphText,
  getElementPageRect,
  isRectValid,
} from "./html.ts";
import { useInterestsStore } from "./stores/interests-store.ts";
import { type VectoriaSearchResult } from "@/background/vectoria-index.ts";
import { sendMessage } from "@/shared/messaging.ts";
import type { VectoriaSearchMessageResult } from "@/background/messages/vectoria";
import { canonicalUrl } from "@/shared/url.ts";
import { isRecord, type UnknownRecord } from "@/shared/typeUtils";

// -------- Vectoria interest surface --------
const INTEREST_MAX_COUNT = 300;
const INTEREST_MIN_LENGTH = 80;
const INTEREST_STAY_MS = 2000;
const INTEREST_COOLDOWN_MS = 60_000;
const DEFAULT_MATCH_THRESHOLD = 0.5;
const SETTINGS_STORAGE_KEY = "myz::settings";

let interestMatchThreshold = DEFAULT_MATCH_THRESHOLD;
let settingsSyncInstalled = false;
let vectorSearchEnabled = false;
let monitoringActive = false;

function normalizeMatchThreshold(value: unknown): number {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : DEFAULT_MATCH_THRESHOLD;
  return Math.min(1, Math.max(0.4, n));
}

function resolveVectorSearchEnabled(
  settings: UnknownRecord | null | undefined,
): boolean {
  const vectorSearch = isRecord(settings?.vectorSearch)
    ? settings?.vectorSearch
    : null
  const target = isRecord(vectorSearch?.target) ? vectorSearch.target : null
  const enabled = Boolean(vectorSearch?.enabled)
  return Boolean(
    enabled &&
      target &&
      typeof target.modelId === "string" &&
      target.modelId.trim(),
  )
}

async function loadVectorSearchEnabled(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(SETTINGS_STORAGE_KEY);
    const bundle = stored?.[SETTINGS_STORAGE_KEY];
    // Support both bundle format {schemaVersion, data} and direct format
    const settings = bundle?.data || bundle;
    interestMatchThreshold = normalizeMatchThreshold(
      settings?.vectorSearch?.matchThreshold,
    );
    const enabled = resolveVectorSearchEnabled(settings);
    updateVectorSearchEnabled(enabled);
    return enabled;
  } catch {
    updateVectorSearchEnabled(false);
    return false;
  }
}

function installSettingsSync(): void {
  if (settingsSyncInstalled) return;
  settingsSyncInstalled = true;
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      const change = changes?.[SETTINGS_STORAGE_KEY];
      if (!change) return;
      const bundle = change.newValue;
      // Support both bundle format {schemaVersion, data} and direct format
      const settings = bundle?.data || bundle;
      const nextThreshold = normalizeMatchThreshold(
        settings?.vectorSearch?.matchThreshold,
      );
      if (nextThreshold !== interestMatchThreshold) {
        interestMatchThreshold = nextThreshold;
        pruneMatchesBelowThreshold(nextThreshold);
      }
      updateVectorSearchEnabled(resolveVectorSearchEnabled(settings));
    });
  } catch {
    // ignore
  }
}

interface InterestStatus {
  text: string;
  timer: ReturnType<typeof setTimeout> | null;
  lastSearchAt: number;
  searching: boolean;
}

let interestObserver: IntersectionObserver | null = null;
let interestMutationObserver: MutationObserver | null = null;
let interestRescanTimer: ReturnType<typeof setTimeout> | null = null;
let interestIndicatorsHost: HTMLElement | null = null;

let indicatorUpdateScheduled = false;
let interestTempRectKeyId = 0;

function cleanupInterestState(): void {
  const interestStore = useInterestsStore();
  monitoringActive = false;
  if (interestRescanTimer) {
    clearTimeout(interestRescanTimer);
    interestRescanTimer = null;
  }
  if (interestObserver) {
    try {
      interestObserver.disconnect();
    } catch {}
  }
  interestObserver = null;
  if (interestMutationObserver) {
    try {
      interestMutationObserver.disconnect();
    } catch {}
  }
  interestMutationObserver = null;
  interestStore.interestState.forEach((state) => {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    state.searching = false;
  });
  interestStore.interestState.clear();
  interestStore.interestMatchesByRecord.clear();
  interestStore.interestElementIndicators.forEach(({ el }) => {
    if (el?.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  interestStore.interestElementIndicators.clear();
  if (interestIndicatorsHost?.parentNode) {
    interestIndicatorsHost.parentNode.removeChild(interestIndicatorsHost);
  }
  interestIndicatorsHost = null;
}

function stopInterestMonitoring(): void {
  if (!monitoringActive) return;
  monitoringActive = false;
  cleanupInterestState();
}

function startInterestObservers(): void {
  if (monitoringActive) return;
  monitoringActive = true;
  const interestStore = useInterestsStore();
  if (!interestObserver) {
    interestObserver = new IntersectionObserver(handleInterestEntries, {
      threshold: 0.6,
    });
  }

  const targets = collectLeafBlocks(INTEREST_MAX_COUNT, INTEREST_MIN_LENGTH);
  targets.forEach(({ element, text }) => {
    interestStore.interestState.set(element, {
      text,
      timer: null,
      lastSearchAt: 0,
      searching: false,
    });
    interestObserver?.observe(element);
  });

  if (!interestMutationObserver) {
    interestMutationObserver = new MutationObserver(scheduleInterestRescan);
    interestMutationObserver.observe(
      document.body || document.documentElement,
      {
        childList: true,
        subtree: true,
      },
    );
  }
}

function updateVectorSearchEnabled(next: boolean): void {
  const interestStore = useInterestsStore();
  const enabled = Boolean(next);
  interestStore.setVectorSearchEnabled(enabled);
  if (enabled === vectorSearchEnabled) {
    if (enabled && !monitoringActive) {
      startInterestObservers();
    }
    return;
  }
  vectorSearchEnabled = enabled;
  if (!enabled) {
    stopInterestMonitoring();
  } else {
    startInterestObservers();
  }
}

export function startInterestMonitoring(): void {
  void loadVectorSearchEnabled();
  installSettingsSync();
}

function scheduleInterestRescan(): void {
  if (interestRescanTimer) return;
  interestRescanTimer = setTimeout(() => {
    interestRescanTimer = null;
    rescanInterestTargets();
  }, 600);
}

function rescanInterestTargets() {
  const interestStore = useInterestsStore();
  if (!interestObserver) return;
  // Clean up removed nodes
  Array.from(interestStore.interestState.keys()).forEach((el) => {
    if (!document.contains(el)) {
      interestStore.interestState.delete(el);
      try {
        interestObserver?.unobserve(el);
      } catch {}
    }
  });
  const targets = collectLeafBlocks(INTEREST_MAX_COUNT, INTEREST_MIN_LENGTH);
  let added = 0;
  targets.forEach(({ element, text }) => {
    if (interestStore.interestState.has(element)) {
      return;
    }
    interestStore.interestState.set(element, {
      text,
      timer: null,
      lastSearchAt: 0,
      searching: false,
    });
    interestObserver?.observe(element);
    added += 1;
  });
  if (added > 0) {
    // console.log("[MyZ Vectoria] rescan added", added, "new candidates");
  }
}

function handleInterestEntries(entries: IntersectionObserverEntry[]): void {
  const interestStore = useInterestsStore();
  entries.forEach((entry) => {
    const el = entry.target;
    const state = interestStore.interestState.get(el);
    if (!state) return;
    if (!entry.isIntersecting) {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      return;
    }
    if (state.timer || state.searching) {
      return;
    }
    state.timer = setTimeout(() => {
      state.timer = null;
      runSemanticLookup(el, state);
    }, INTEREST_STAY_MS);
  });
}

// fixme: typing state
async function runSemanticLookup(
  element: Element,
  state: InterestStatus,
): Promise<void> {
  const now = Date.now();
  if (now - state.lastSearchAt < INTEREST_COOLDOWN_MS) {
    return;
  }
  const text = normalizeParagraphText(element);
  const finalText =
    (state?.text && state.text.trim().length ? state.text : text) || "";
  if (!finalText || finalText.length < INTEREST_MIN_LENGTH) {
    return;
  }
  state.lastSearchAt = now;
  state.searching = true;
  // const startedAt = performance.now();
  let filtered: VectoriaSearchResult[] = [];
  let hits: VectoriaSearchResult[] = [];
  try {
    const trimmed =
      finalText.length > 800 ? `${finalText.slice(0, 800)}…` : finalText;
    const response = await sendMessage<
      { text?: string; topK?: number },
      VectoriaSearchMessageResult
    >("myz:vectoriaSearch", {
      text: trimmed,
      topK: 3,
    });
    const results: VectoriaSearchResult[] = Array.isArray(response?.results)
      ? response.results
      : [];
    const currentCanonical = canonicalUrl(window.location.href);
    filtered = results.filter((item) => {
      const targetUrl = item?.metadata?.url || "";
      const targetCanonical = canonicalUrl(targetUrl);
      // Exclude same-page matches
      if (targetCanonical && targetCanonical === currentCanonical) {
        return false;
      }
      return typeof item?.score === "number";
    });
    hits = filtered
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    if (hits.length) {
      updateInterestAggregates(hits, element);
    }
  } catch (error) {
    console.warn("Vectoria lookup failed", error);
  } finally {
    // const duration = Math.round(performance.now() - startedAt);
    // const topScore = hits.length ? hits[0].score || 0 : 0;
    // console.log(
    //   "[MyZ Vectoria]",
    //   "queryLength=",
    //   finalText.length,
    //   "matches=",
    //   filtered.length,
    //   "topScore=",
    //   topScore.toFixed ? topScore.toFixed(3) : topScore,
    //   "timeMs=",
    //   duration,
    // );
    state.searching = false;
  }
}

function updateInterestAggregates(
  matches: VectoriaSearchResult[] = [],
  element: Element,
): void {
  const interestStore = useInterestsStore();
  matches.forEach((match) => {
    const key: string =
      match?.metadata?.recordId ||
      match?.id ||
      match?.metadata?.url ||
      match?.text;
    if (!key) return;
    const existing = interestStore.interestMatchesByRecord.get(key);
    if (!existing || (match.score || 0) > (existing.match.score || 0)) {
      const rect = element ? getElementPageRect(element) : existing?.rect;
      const rectKey =
        element || existing?.rectKey
          ? existing?.rectKey
          : `rect-${++interestTempRectKeyId}`;
      interestStore.interestMatchesByRecord.set(key, {
        match: { ...match },
        element,
        rect,
        rectKey,
      });
    }
  });
  updateInterestIndicators();
}

function pruneMatchesBelowThreshold(threshold: number): void {
  const interestStore = useInterestsStore();
  const entries = Array.from(interestStore.interestMatchesByRecord.entries());
  entries.forEach(([key, entry]) => {
    const score = entry?.match?.score || 0;
    if (
      typeof score !== "number" ||
      !Number.isFinite(score) ||
      score < threshold
    ) {
      interestStore.interestMatchesByRecord.delete(key);
    }
  });
  updateInterestIndicators();
}

function ensureInterestIndicatorsHost(): HTMLElement {
  if (
    interestIndicatorsHost &&
    document.contains(interestIndicatorsHost) &&
    interestIndicatorsHost.shadowRoot?.firstChild
  ) {
    return interestIndicatorsHost;
  }
  const host = document.createElement("div");
  host.setAttribute("data-myz-interest-indicators", "1");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .indicator {
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #f59e0b;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.6);
    pointer-events: none;
    z-index: 2147483644;
    opacity: 0.9;
    }
  `;
  const layer = document.createElement("div");
  layer.style.position = "fixed";
  layer.style.top = "0";
  layer.style.left = "0";
  layer.style.width = "100%";
  layer.style.height = "100%";
  layer.style.pointerEvents = "none";
  shadow.appendChild(style);
  shadow.appendChild(layer);
  document.documentElement.appendChild(host);
  interestIndicatorsHost = host;
  return host;
}

function updateInterestIndicators(): void {
  if (!vectorSearchEnabled) return;
  const interestStore = useInterestsStore();
  const host = ensureInterestIndicatorsHost();
  const layer = host.shadowRoot?.lastChild;
  if (!layer) return;
  const activeKeys = new Set<unknown>();

  Array.from(interestStore.interestMatchesByRecord.entries()).forEach(
    ([mapKey, { element, rect, rectKey }]) => {
      let targetRect = null;
      if (element && document.contains(element)) {
        targetRect = element.getBoundingClientRect();
      } else if (isRectValid(rect)) {
        const visibleRect = rect as ElementPosition;
        targetRect = {
          left: visibleRect.left - window.scrollX,
          top: visibleRect.top - window.scrollY,
          width: visibleRect.width,
          height: visibleRect.height,
        };
      }
      if (!targetRect) {
        interestStore.interestMatchesByRecord.delete(mapKey);
        return;
      }
      const indicatorKey = element || rectKey || mapKey;
      activeKeys.add(indicatorKey);
      let indicator = interestStore.interestElementIndicators.get(indicatorKey);
      if (!indicator) {
        const dot = document.createElement("div");
        dot.className = "indicator";
        layer.appendChild(dot);
        indicator = { el: dot };
        interestStore.interestElementIndicators.set(indicatorKey, indicator);
      }
      const x = targetRect.left - 2;
      const y = targetRect.top - 2;
      indicator.el.style.transform = `translate(${x}px, ${y}px)`;
    },
  );

  // Cleanup removed elements and stale indicators
  Array.from(interestStore.interestElementIndicators.entries()).forEach(
    ([key, indicator]) => {
      const isElementKey = key instanceof Element;
      const isValidElement = !isElementKey || document.contains(key);
      if (!activeKeys.has(key) || !isValidElement) {
        if (indicator.el?.parentNode) {
          indicator.el.parentNode.removeChild(indicator.el);
        }
        interestStore.interestElementIndicators.delete(key);
      }
    },
  );
}

export function scheduleIndicatorUpdate(): void {
  if (indicatorUpdateScheduled) return;
  indicatorUpdateScheduled = true;
  requestAnimationFrame(() => {
    indicatorUpdateScheduled = false;
    updateInterestIndicators();
  });
}

export function resetInterestStateForNavigation(): void {
  cleanupInterestState();
  startInterestMonitoring();
}
