import { type VectoriaSearchResult } from "../background/vectoria-index.ts";
import { sendMessage } from "../shared/messaging.ts";
import { canonicalUrl } from "../shared/url.ts";
import {
  isInHighlightCache,
  focusHighlight,
  markHighlightForReapply,
} from "./highlight-state.ts";

// -------- Vectoria interest surface --------
const INTEREST_MIN_LENGTH = 80;
const INTEREST_STAY_MS = 2000;
const INTEREST_COOLDOWN_MS = 60_000;
const INTEREST_SCORE_THRESHOLD = 0.32;
const BLOCK_DISPLAY_SET = new Set([
  "block",
  "list-item",
  "flex",
  "grid",
  "table",
  "inline-block",
]);
const BLOCK_TAG_SET = new Set([
  "P",
  "LI",
  "BLOCKQUOTE",
  "SECTION",
  "ARTICLE",
  "DIV",
  "UL",
  "OL",
]);

interface ElmenetPosition {
  left: number | null;
  top: number | null;
  right: number | null;
  bottom: number | null;
}

const interestState = new Map();
let interestObserver: IntersectionObserver | null = null;
let interestMutationObserver: MutationObserver | null = null;
let interestRescanTimer: ReturnType<typeof setTimeout> | null = null;
let interestPopupHost: HTMLElement | null = null;
let interestIndicatorsHost: HTMLElement | null = null;
const interestMatchesByRecord = new Map();
const interestElementIndicators = new Map();
let interestPopupCollapsed = false;
let interestDockPosition: ElmenetPosition = {
  top: 0.75,
  left: null,
  right: 0.05,
  bottom: null,
};
let indicatorUpdateScheduled = false;
let interestTempRectKeyId = 0;

function normalizeParagraphText(node: Element) {
  if (!node) return "";
  return ((node as HTMLElement).innerText || node.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getElementPageRect(el: Element) {
  const rect = el?.getBoundingClientRect?.();
  if (!rect) return null;
  return {
    left: rect.left + window.scrollX,
    top: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  };
}

function isRectValid(rect?: DOMRect) {
  return (
    rect &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function isElementVisible(el: Element) {
  if (!el || !(el instanceof Element)) return false;
  const rects = el.getClientRects();
  if (!rects || rects.length === 0) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  return rects[0].width > 0 && rects[0].height > 0;
}

function isBlockElement(el: Element) {
  if (!el || !(el instanceof Element)) return false;
  if (BLOCK_TAG_SET.has(el.tagName)) return true;
  const display = getComputedStyle(el).display;
  return BLOCK_DISPLAY_SET.has(display);
}

function isElementInViewport(el: Element): boolean {
  if (!el || !(el instanceof Element)) return false;
  const rect = el.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return false;
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  return rect.bottom > 0 && rect.right > 0 && rect.top < vh && rect.left < vw;
}

function extractInlineText(el: Element): string {
  const parts: string[] = [];
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || "");
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element;
      if (isBlockElement(child)) {
        return;
      }
      parts.push(normalizeParagraphText(child));
    }
  });
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function collectLeafBlocks(maxCount: number = 300) {
  const results: { element: HTMLElement; text: string }[] = [];
  const selected = new WeakSet<HTMLElement>();
  const walker = document.createTreeWalker(
    document.body || document.documentElement,
    NodeFilter.SHOW_ELEMENT,
  );
  const start = performance.now();
  let node;
  while ((node = walker.nextNode()) && results.length < maxCount) {
    if (!(node instanceof HTMLElement)) continue;
    if (!isElementVisible(node)) continue;
    if (!isBlockElement(node)) continue;
    if (hasSelectedAncestor(node, selected)) continue;

    const children = Array.from(node.children);
    const hasBlockChild = children.some((child) => isBlockElement(child));

    let text = "";
    if (hasBlockChild) {
      text = extractInlineText(node);
    } else {
      text = normalizeParagraphText(node);
    }

    if (text && text.length >= INTEREST_MIN_LENGTH) {
      results.push({ element: node, text });
      if (!hasBlockChild) {
        selected.add(node);
      }
    }
  }
  const duration = Math.round(performance.now() - start);
  console.log(
    "[MyZ Vectoria] collected candidates",
    results.length,
    "in",
    duration,
    "ms",
  );
  return results;
}

function hasSelectedAncestor(
  node: HTMLElement,
  selected: WeakSet<HTMLElement>,
) {
  let current = node?.parentElement;
  while (current) {
    if (selected.has(current)) return true;
    current = current.parentElement;
  }
  return false;
}

export function startInterestMonitoring() {
  if (!interestObserver) {
    interestObserver = new IntersectionObserver(handleInterestEntries, {
      threshold: 0.6,
    });
  }

  const targets = collectLeafBlocks();
  targets.forEach(({ element, text }) => {
    interestState.set(element, {
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

function scheduleInterestRescan() {
  if (interestRescanTimer) return;
  interestRescanTimer = setTimeout(() => {
    interestRescanTimer = null;
    rescanInterestTargets();
  }, 600);
}

function rescanInterestTargets() {
  if (!interestObserver) return;
  // Clean up removed nodes
  Array.from(interestState.keys()).forEach((el) => {
    if (!document.contains(el)) {
      interestState.delete(el);
      try {
        interestObserver?.unobserve(el);
      } catch {}
    }
  });
  const targets = collectLeafBlocks();
  let added = 0;
  targets.forEach(({ element, text }) => {
    if (interestState.has(element)) {
      return;
    }
    interestState.set(element, {
      text,
      timer: null,
      lastSearchAt: 0,
      searching: false,
    });
    interestObserver?.observe(element);
    added += 1;
  });
  if (added > 0) {
    console.log("[MyZ Vectoria] rescan added", added, "new candidates");
  }
}

function handleInterestEntries(entries: IntersectionObserverEntry[]) {
  entries.forEach((entry) => {
    const el = entry.target;
    const state = interestState.get(el);
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
async function runSemanticLookup(element: Element, state: any) {
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
  const startedAt = performance.now();
  let filtered: VectoriaSearchResult[] = [];
  let hits: VectoriaSearchResult[] = [];
  try {
    const trimmed =
      finalText.length > 800 ? `${finalText.slice(0, 800)}…` : finalText;
    const response = (await sendMessage("myz:vectoriaSearch", {
      text: trimmed,
      topK: 3,
    })) as { results?: VectoriaSearchResult[] };
    const results = Array.isArray(response?.results) ? response.results : [];
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
      .filter(
        (item) =>
          typeof item?.score === "number" &&
          item.score >= INTEREST_SCORE_THRESHOLD,
      )
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    if (hits.length) {
      updateInterestAggregates(hits, element);
      showInterestPopup();
    }
  } catch (error) {
    console.warn("Vectoria lookup failed", error);
  } finally {
    const duration = Math.round(performance.now() - startedAt);
    const topScore = hits.length ? hits[0].score || 0 : 0;
    console.log(
      "[MyZ Vectoria]",
      "queryLength=",
      finalText.length,
      "matches=",
      filtered.length,
      "topScore=",
      topScore.toFixed ? topScore.toFixed(3) : topScore,
      "timeMs=",
      duration,
    );
    state.searching = false;
  }
}

function ensureInterestPopupHost() {
  if (
    interestPopupHost &&
    document.contains(interestPopupHost) &&
    interestPopupHost.shadowRoot?.querySelector("#myz-interest-popup")
  ) {
    return interestPopupHost;
  }
  const host = document.createElement("div");
  host.setAttribute("data-myz-interest", "1");
  const shadow = host.attachShadow({ mode: "open" });
  const wrapper = document.createElement("div");
  wrapper.id = "myz-interest-popup";
  const style = document.createElement("style");
  style.textContent = `
    :host {
    all: initial;
    }
    #myz-interest-popup, #myz-interest-popup * {
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    }
    #myz-interest-popup {
    position: fixed;
    bottom: 20px;
    right: 20px;
    max-width: 340px;
    background: rgba(15,23,42,0.95);
    color: #f8fafc;
    border-radius: 14px;
    box-shadow: 0 18px 32px rgba(15,23,42,0.4);
    padding: 14px;
    font-size: 13px;
    z-index: 2147483645;
    pointer-events: auto;
    }
    #myz-interest-popup.collapsed {
    width: auto;
    height: auto;
    max-width: none;
    max-height: none;
    padding: 0;
    background: transparent;
    box-shadow: none;
    border-radius: 0;
    }
    #myz-interest-popup.collapsed .dock-button {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    background: #4f46e5;
    color: #fff;
    box-shadow: 0 12px 22px rgba(79,70,229,0.38);
    font-size: 13px;
    font-weight: 700;
    cursor: move;
    user-select: none;
    }
    .myz-interest-header { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 8px; margin-bottom: 6px; }
    .myz-interest-title { font-weight: 700; font-size: 14px; }
    .myz-interest-badge {
    min-width: 24px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(255,255,255,0.12);
    color: #e0e7ff;
    font-weight: 600;
    font-size: 12px;
    text-align: center;
    justify-self: start;
    }
    .myz-interest-item { border-top: 1px solid rgba(255,255,255,0.08); padding: 8px 0; }
    .myz-interest-item:first-of-type { border-top: none; padding-top: 0; }
    .myz-interest-meta { font-size: 11px; color: #cbd5e1; margin-bottom: 4px; }
    .myz-interest-text { color: #e2e8f0; line-height: 1.4; margin-bottom: 6px; }
    .myz-interest-actions { display: flex; gap: 8px; }
    .myz-interest-btn {
    background: #4f46e5;
    color: white;
    border: none;
    border-radius: 10px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    }
    .myz-interest-btn.secondary {
    background: rgba(255,255,255,0.12);
    }
    .myz-interest-close {
    background: transparent;
    border: none;
    color: #cbd5e1;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    justify-self: end;
    }
    .myz-interest-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
    font-size: 12px;
    color: #cbd5e1;
    }
    .myz-interest-link {
    color: #a5b4fc;
    text-decoration: underline;
    cursor: pointer;
    }
  `;
  shadow.appendChild(style);
  shadow.appendChild(wrapper);
  document.documentElement.appendChild(host);
  interestPopupHost = host;
  return host;
}

function showInterestPopup() {
  const host = ensureInterestPopupHost();
  const shadow = host.shadowRoot;
  if (!shadow) return;
  const container = shadow.querySelector("#myz-interest-popup") as HTMLElement;
  if (!container) return;
  container.innerHTML = "";
  if (interestPopupCollapsed) {
    container.classList.add("collapsed");
    applyDockPosition(container);
    renderDock(container as HTMLElement);
    return;
  }

  container.classList.remove("collapsed");
  container.style.top = "auto";
  container.style.left = "auto";
  container.style.right = "20px";
  container.style.bottom = "20px";

  const header = document.createElement("div");
  header.className = "myz-interest-header";
  const title = document.createElement("div");
  title.className = "myz-interest-title";
  title.textContent = "发现与你标注相关的内容";
  header.appendChild(title);
  const badgeCount = interestMatchesByRecord.size;
  const badge = document.createElement("div");
  badge.className = "myz-interest-badge";
  badge.textContent = String(badgeCount);
  header.appendChild(badge);
  container.appendChild(header);

  const closeBtn = document.createElement("button");
  closeBtn.className = "myz-interest-close";
  closeBtn.textContent = "×";
  closeBtn.onclick = (e) => {
    e?.stopPropagation?.();
    collapseInterestPopup();
  };
  header.appendChild(closeBtn);

  const sorted = Array.from(interestMatchesByRecord.values()).sort(
    (a, b) => (b.match.score || 0) - (a.match.score || 0),
  );
  const visibleMatches = sorted.filter(({ element }) =>
    isElementInViewport(element),
  );
  const topMatches = visibleMatches.slice(0, 5);
  const remaining = Math.max(sorted.length - topMatches.length, 0);

  topMatches.forEach(({ match, element }) => {
    const item = document.createElement("div");
    item.className = "myz-interest-item";
    const meta = document.createElement("div");
    meta.className = "myz-interest-meta";
    const hostLabel =
      match.metadata?.host || match.metadata?.url || "已保存的标注";
    meta.textContent = `${hostLabel} · 相似度 ${(match.score * 100).toFixed(1)}%`;
    const text = document.createElement("div");
    text.className = "myz-interest-text";
    const snippet = (match.text || "").slice(0, 140);
    text.textContent = snippet;
    const actions = document.createElement("div");
    actions.className = "myz-interest-actions";
    const viewBtn = document.createElement("button");
    viewBtn.className = "myz-interest-btn";
    viewBtn.textContent = "定位当前段落";
    viewBtn.onclick = () => handleInterestClick(match, element);
    const openPageBtn = document.createElement("button");
    openPageBtn.className = "myz-interest-btn secondary";
    openPageBtn.textContent = "打开页面";
    openPageBtn.onclick = () => {
      if (match.metadata?.url) {
        window.open(match.metadata.url, "_blank", "noopener");
      }
    };
    actions.appendChild(viewBtn);
    actions.appendChild(openPageBtn);
    item.appendChild(meta);
    item.appendChild(text);
    item.appendChild(actions);
    container.appendChild(item);
  });

  if (remaining > 0) {
    const footer = document.createElement("div");
    footer.className = "myz-interest-footer";
    const footerText = document.createElement("div");
    footerText.textContent = `还有 ${remaining} 条相关标注已统计`;
    const sideLink = document.createElement("span");
    sideLink.className = "myz-interest-link";
    sideLink.textContent = "侧边栏查看全部";
    sideLink.onclick = () => openMatchesInSidepanel(sorted.map((m) => m.match));
    footer.appendChild(footerText);
    footer.appendChild(sideLink);
    container.appendChild(footer);
  }
}

function handleInterestClick(match: any, element: HTMLElement) {
  const recordId = match.metadata?.recordId;
  const targetUrl = match.metadata?.url || "";
  const currentCanonical = canonicalUrl(window.location.href);
  const targetCanonical = canonicalUrl(targetUrl);

  // If same page match is filtered, rely on current element for positioning.
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    flashElement(element);
  } else if (match.rect && isRectValid(match.rect)) {
    const targetTop = Math.max(0, match.rect.top - 120);
    window.scrollTo({ top: targetTop, behavior: "smooth" });
  } else if (recordId && targetCanonical === currentCanonical) {
    if (isInHighlightCache(recordId)) {
      focusHighlight(recordId);
    } else {
      markHighlightForReapply(recordId);
      setTimeout(() => focusHighlight(recordId), 800);
    }
  }
}

// fixme: typing matches
function openMatchesInSidepanel(matches: any[]) {
  const aggregated = Array.from(interestMatchesByRecord.values()).map(
    (item) => item.match,
  );
  const payloadMatches =
    aggregated.length && Array.isArray(matches)
      ? aggregated.slice().sort((a, b) => (b.score || 0) - (a.score || 0))
      : Array.isArray(matches)
        ? matches.slice().sort((a, b) => (b.score || 0) - (a.score || 0))
        : [];
  if (!payloadMatches.length) return;
  sendMessage("myz:showRelatedHighlights", {
    matches: payloadMatches.map((item) => ({
      id: item.id,
      text: item.text,
      score: item.score,
      metadata: item.metadata,
    })),
    url: window.location.href,
  }).catch((error) => console.warn("open sidepanel failed", error));
}

function updateInterestAggregates(
  matches: VectoriaSearchResult[] = [],
  element: Element,
) {
  matches.forEach((match) => {
    const key =
      match?.metadata?.recordId ||
      match?.id ||
      match?.metadata?.url ||
      match?.text;
    if (!key) return;
    const existing = interestMatchesByRecord.get(key);
    if (!existing || (match.score || 0) > (existing.match.score || 0)) {
      const rect = element ? getElementPageRect(element) : existing?.rect;
      const rectKey =
        element || existing?.rectKey
          ? existing?.rectKey
          : `rect-${++interestTempRectKeyId}`;
      interestMatchesByRecord.set(key, {
        match: { ...match },
        element,
        rect,
        rectKey,
      });
    }
  });
  updateInterestIndicators();
}

function flashElement(el: HTMLElement) {
  if (!el || typeof el.classList?.add !== "function") return;
  el.classList.add("myz-ai-chunk-flash");
  setTimeout(() => el.classList.remove("myz-ai-chunk-flash"), 1200);
}

function ensureInterestIndicatorsHost() {
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
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #f59e0b;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.8);
    pointer-events: none;
    z-index: 2147483644;
    opacity: 0.95;
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

function updateInterestIndicators() {
  const host = ensureInterestIndicatorsHost();
  const layer = host.shadowRoot?.lastChild;
  if (!layer) return;
  // Cleanup removed elements and stale indicators
  Array.from(interestElementIndicators.entries()).forEach(
    ([key, indicator]) => {
      if (key instanceof Element && !document.contains(key)) {
        if (indicator.el?.parentNode) {
          indicator.el.parentNode.removeChild(indicator.el);
        }
        interestElementIndicators.delete(key);
      }
    },
  );

  Array.from(interestMatchesByRecord.entries()).forEach(
    ([mapKey, { element, rect, rectKey }]) => {
      let targetRect = null;
      if (element && document.contains(element)) {
        targetRect = element.getBoundingClientRect();
      } else if (isRectValid(rect)) {
        targetRect = {
          left: rect.left - window.scrollX,
          top: rect.top - window.scrollY,
          width: rect.width,
          height: rect.height,
        };
      }
      if (!targetRect) {
        interestMatchesByRecord.delete(mapKey);
        return;
      }
      const indicatorKey = element || rectKey || mapKey;
      let indicator = interestElementIndicators.get(indicatorKey);
      if (!indicator) {
        const dot = document.createElement("div");
        dot.className = "indicator";
        layer.appendChild(dot);
        indicator = { el: dot };
        interestElementIndicators.set(indicatorKey, indicator);
      }
      const x = targetRect.left - 6;
      const y = targetRect.top - 6;
      indicator.el.style.transform = `translate(${x}px, ${y}px)`;
    },
  );
}

export function scheduleIndicatorUpdate() {
  if (indicatorUpdateScheduled) return;
  indicatorUpdateScheduled = true;
  requestAnimationFrame(() => {
    indicatorUpdateScheduled = false;
    updateInterestIndicators();
    if (!interestPopupCollapsed) {
      showInterestPopup();
    }
  });
}

export function resetInterestStateForNavigation() {
  interestMatchesByRecord.clear();
  interestElementIndicators.forEach(({ el }) => {
    if (el?.parentNode) {
      el.parentNode.removeChild(el);
    }
  });
  interestElementIndicators.clear();
  if (interestIndicatorsHost?.parentNode) {
    interestIndicatorsHost.parentNode.removeChild(interestIndicatorsHost);
  }
  interestIndicatorsHost = null;
  if (interestPopupHost?.parentNode) {
    interestPopupHost.parentNode.removeChild(interestPopupHost);
  }
  interestPopupHost = null;
  interestPopupCollapsed = false;
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
  interestState.clear();
  startInterestMonitoring();
}

function applyDockPosition(container: HTMLElement) {
  if (!container) return;
  const topPercent =
    typeof interestDockPosition.top === "number"
      ? interestDockPosition.top
      : 0.75;
  container.style.top = `${Math.min(0.9, Math.max(0.05, topPercent)) * 100}%`;
  container.style.bottom = "auto";
  if (interestDockPosition.left !== null) {
    container.style.left = `${Math.max(0, interestDockPosition.left * 100)}%`;
    container.style.right = "auto";
  } else {
    container.style.right = `${Math.max(
      0,
      (interestDockPosition.right ?? 0.05) * 100,
    )}%`;
    container.style.left = "auto";
  }
}

function renderDock(container: HTMLElement) {
  container.innerHTML = "";
  const dock: HTMLButtonElement = document.createElement("button");
  dock.className = "dock-button";
  dock.textContent = String(Math.max(interestMatchesByRecord.size, 0));
  container.appendChild(dock);
  let dragging = false;
  let moved = false;
  let startY = 0;
  let startX = 0;
  let startTop = 0;
  let startLeft = 0;
  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    moved = true;
    const deltaY = e.clientY - startY;
    const deltaX = e.clientX - startX;
    const viewHeight = window.innerHeight || 1;
    const viewWidth = window.innerWidth || 1;
    const newTop = Math.min(viewHeight - 24, Math.max(24, startTop + deltaY));
    const newLeft = Math.min(viewWidth - 24, Math.max(0, startLeft + deltaX));
    interestDockPosition.top = newTop / viewHeight;
    interestDockPosition.left = newLeft / viewWidth;
    interestDockPosition.right = null;
    applyDockPosition(container);
  };
  const endDrag = () => {
    dragging = false;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", endDrag);
  };
  dock.onmousedown = (e) => {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startX = e.clientX;
    startTop = (window.innerHeight || 1) * (interestDockPosition.top || 0.75);
    startLeft =
      interestDockPosition.left !== null
        ? (window.innerWidth || 1) * interestDockPosition.left
        : (window.innerWidth || 1) * (1 - (interestDockPosition.right ?? 0.05));
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", endDrag);
  };
  dock.onclick = (e) => {
    if (e && typeof e.stopPropagation === "function") {
      e.stopPropagation();
    }
    if (dragging || moved) {
      moved = false;
      return;
    }
    interestPopupCollapsed = false;
    showInterestPopup();
  };
}

function collapseInterestPopup() {
  interestPopupCollapsed = true;
  showInterestPopup();
  scheduleIndicatorUpdate();
}
