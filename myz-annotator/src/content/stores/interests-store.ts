import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { ElementPosition } from "../html";
import { VectoriaSearchResult } from "@/background/vectoria-index";

import { sendMessage } from "@/shared/messaging";

const INTEREST_POPUP_COLLAPSED_KEY = "myz::interestPopupCollapsed";

export interface DockPosition {
  top: number | "auto";
  left: number | "auto";
  right: number | "auto";
  bottom: number | "auto";
}

export interface InterestStatus {
  text: string;
  timer: ReturnType<typeof setTimeout> | null;
  lastSearchAt: number;
  searching: boolean;
}

export interface InterestMatchResult extends VectoriaSearchResult {
  rect?: ElementPosition;
}

export interface InterestMatchEntry {
  match: InterestMatchResult;
  element: Element;
  rect?: ElementPosition | null;
  rectKey?: string;
}

export interface InterestIndicator {
  el: HTMLElement;
}

export const useInterestsStore = defineStore("interests", () => {
  const popupCollapsed = ref(false);

  const dockPosition = ref<DockPosition>({
    top: 0.75,
    left: "auto",
    right: 0.05,
    bottom: "auto",
  });

  const interestState = ref<Map<Element, InterestStatus>>(new Map());

  const interestMatchesByRecord = ref<Map<string, InterestMatchEntry>>(
    new Map(),
  );

  const interestElementIndicators = ref<Map<Element, InterestIndicator>>(
    new Map(),
  );

  const badgeCount = computed(() => {
    return interestMatchesByRecord.value.size;
  });

  async function loadPopupCollapsedState() {
    try {
      const stored = await chrome.storage.local.get(INTEREST_POPUP_COLLAPSED_KEY);
      popupCollapsed.value = Boolean(stored?.[INTEREST_POPUP_COLLAPSED_KEY]);
    } catch (error) {
      // ignore: keep default
    }
  }

  async function setPopupCollapsed(next: boolean) {
    const value = Boolean(next);
    popupCollapsed.value = value;
    try {
      await chrome.storage.local.set({ [INTEREST_POPUP_COLLAPSED_KEY]: value });
    } catch (error) {
      // ignore: in-page UI still updates
    }
  }

  function installPopupCollapsedSync() {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        const change = changes?.[INTEREST_POPUP_COLLAPSED_KEY];
        if (!change) return;
        popupCollapsed.value = Boolean(change.newValue);
      });
    } catch (error) {
      // ignore
    }
  }

  const applyDockPosition = (position: DockPosition) => {
    dockPosition.value = position;
  };

  function openMatchesInSidepanel(matches: VectoriaSearchResult[]): void {
    const aggregated = Array.from(interestMatchesByRecord.value.values()).map(
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

  // Initialize persisted UI state early.
  void loadPopupCollapsedState();
  installPopupCollapsedSync();

  return {
    popupCollapsed,
    setPopupCollapsed,
    dockPosition,
    badgeCount,
    interestState,
    interestMatchesByRecord,
    interestElementIndicators,
    applyDockPosition,
    openMatchesInSidepanel,
  };
});
