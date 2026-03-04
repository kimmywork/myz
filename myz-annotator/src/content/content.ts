import { mountApp } from "./app-state.js";
import { restoreHighlights } from "./highlight-state.js";
import { resetInterestStateForNavigation } from "./interests-state.js";
import {
  scheduleIndicatorUpdate,
  startInterestMonitoring,
} from "./interests-state.js";
import { messageListener } from "./message-listener.js";
import { useToolbarStore } from "./stores/toolbar-store.js";
import { ensureContentStyles } from "./styles.js";

import {
  handleSelectionTrigger,
  handleDocumentClick,
  handleScrollWhileSelecting,
  maybeShowToolbarForActiveSelection,
  updateToolbarRange,
} from "./toolbar-state.js";
import { hasArticleElement, toggleZenMode, isZenModeEnabled } from "./zen.js";
import { canonicalUrl } from "@/shared/url.js";

declare global {
  interface Window {
    __myzAnnotatorInitialized?: boolean;
    __myz_app?: ReturnType<typeof mountApp>;
  }
}

(() => {
  if (window.__myzAnnotatorInitialized) {
    return;
  }
  const appInstance = mountApp();
  window.__myz_app = appInstance;

  window.__myzAnnotatorInitialized = true;
  const CANONICAL_URL = canonicalUrl(window.location.href);

  // Keep a handle to our injected style.
  ensureContentStyles();

  const toolbarStore = useToolbarStore();

  init().catch((error) => console.error("MyZ Annotator init failed", error));

  async function init() {
    document.addEventListener("mouseup", handleSelectionTrigger);
    document.addEventListener("keyup", handleSelectionTrigger);
    document.addEventListener("scroll", handleScrollWhileSelecting, true);
    window.addEventListener("scroll", handleScrollWhileSelecting, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", handleScrollWhileSelecting, {
      passive: true,
    });
    window.addEventListener("scroll", scheduleIndicatorUpdate, {
      passive: true,
    });
    window.addEventListener("resize", scheduleIndicatorUpdate, {
      passive: true,
    });
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("selectionchange", () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        toolbarStore.hide();
        return;
      }
      if (selection.toString().trim()) {
        updateToolbarRange(selection.getRangeAt(0).cloneRange());
        maybeShowToolbarForActiveSelection();
      }
    });

    chrome.runtime.onMessage.addListener(messageListener);

    // E2E/testing bridge: allow toggling via window.postMessage without chrome.runtime
    window.addEventListener("message", (event) => {
      const data = event?.data;
      if (!data || data.__myz_e2e__ !== true) return;
      if (data.type === "toggleZenMode") {
        if (!hasArticleElement()) return;
        toggleZenMode();
        try {
          window.postMessage(
            {
              __myz_e2e__: true,
              type: "zenModeState",
              enabled: isZenModeEnabled(),
            },
            "*",
          );
        } catch {}
      } else if (data.type === "canEnterZenMode") {
        try {
          window.postMessage(
            {
              __myz_e2e__: true,
              type: "canEnterZenMode",
              canEnter: hasArticleElement(),
            },
            "*",
          );
        } catch {}
      }
    });

    // Attach SPA navigation listeners so we can re-run highlight restore when
    // single-page apps change the visible URL without a full reload.
    attachSpaNavigationListeners();

    maybeShowToolbarForActiveSelection();

    await restoreHighlights();
    startInterestMonitoring();
  }

  // Keep track of the last canonical URL so we only re-run restoreHighlights
  // when the logical page changes.
  let lastKnownCanonical = CANONICAL_URL;

  function attachSpaNavigationListeners() {
    // Debounced handler to avoid thrashing during router transitions.
    let navTimer: ReturnType<typeof setTimeout> | null = null;
    function scheduleRestoreIfUrlChanged() {
      const nowCanonical = canonicalUrl(window.location.href);
      if (navTimer) {
        clearTimeout(navTimer);
      }
      navTimer = setTimeout(async () => {
        navTimer = null;
        // Re-run highlight restoration for the new route. Only update the
        // lastKnownCanonical if restore succeeds so we can retry on later
        // attempts if page content isn't ready yet.
        try {
          if (nowCanonical !== lastKnownCanonical) {
            resetInterestStateForNavigation();
          }
          await restoreHighlights();
          lastKnownCanonical = nowCanonical;
        } catch (err) {
          console.error("Failed to restore highlights after navigation", err);
        }
      }, 160);
    }

    // Patch history methods so we can detect programmatic navigation.
    try {
      const rawPush = history.pushState;
      const rawReplace = history.replaceState;
      history.pushState = function (...args) {
        const result = rawPush.apply(this, args);
        scheduleRestoreIfUrlChanged();
        return result;
      };
      history.replaceState = function (...args) {
        const result = rawReplace.apply(this, args);
        scheduleRestoreIfUrlChanged();
        return result;
      };
    } catch (error) {
      // Ignore if content security or readonly history in some environments.
    }

    // Also listen to popstate and hashchange
    window.addEventListener("popstate", scheduleRestoreIfUrlChanged);
    window.addEventListener("hashchange", scheduleRestoreIfUrlChanged);

    startLocationObserver(scheduleRestoreIfUrlChanged);
  }

  function startLocationObserver(callback: () => void) {
    if (typeof callback !== "function") {
      return;
    }
    let rafId: number | null = null;
    let lastHref = window.location.href;
    const check = () => {
      const currentHref = window.location.href;
      if (currentHref !== lastHref) {
        lastHref = currentHref;
        callback();
      }
      rafId = window.requestAnimationFrame(check);
    };
    rafId = window.requestAnimationFrame(check);
    window.addEventListener(
      "beforeunload",
      () => {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
      },
      { once: true },
    );
  }
})();
