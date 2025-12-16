import { defineComponent, ref, FunctionalComponent, computed } from "vue";

import {
  isInHighlightCache,
  focusHighlight,
  markHighlightForReapply,
} from "../highlight-state";
import { flashElement, isRectValid } from "../html";
import { isElementInViewport } from "../html";
import {
  useInterestsStore,
  InterestMatchResult,
  InterestMatchEntry,
} from "@/content/stores/interests-store";
import { canonicalUrl } from "@/shared/url";

function handleInterestClick(
  match: InterestMatchResult,
  element: HTMLElement,
): void {
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

function handleOpenPage(match: InterestMatchResult): void {
  const targetUrl = match.metadata?.url;
  if (targetUrl) {
    window.open(targetUrl, "_blank", "noopener");
  }
}

const InterestDock: FunctionalComponent<{ onClick: (e: Event) => void }> = ({
  onClick,
}) => {
  const store = useInterestsStore();
  const dragging = ref(false);
  const moved = ref(false);
  const dragOffset = ref<{ x: number; y: number }>({ x: 0, y: 0 });

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging.value) return;
    moved.value = true;
    const newTop = e.clientY - dragOffset.value.y;
    const newLeft = e.clientX - dragOffset.value.x;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const clampedTop = Math.min(Math.max(newTop, 10), vh - 10 - 48);
    const clampedLeft = Math.min(Math.max(newLeft, 10), vw - 10 - 48);
    store.applyDockPosition({
      top: clampedTop / vh,
      left: clampedLeft / vw,
      right: "auto",
      bottom: "auto",
    });
  };

  const onMouseUp = () => {
    dragging.value = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };

  const onMouseDown = (e: MouseEvent) => {
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    dragging.value = true;
    dragOffset.value = {
      x:
        e.clientX -
        (store.dockPosition.left === "auto"
          ? (window.innerWidth || document.documentElement.clientWidth || 0) -
            (store.dockPosition.right as number) * vw -
            48
          : (store.dockPosition.left as number) * vw),
      y: e.clientY - (store.dockPosition.top as number) * vh,
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  };

  const onMouseClick = (e: Event) => {
    if (dragging.value || moved.value) {
      moved.value = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onClick(e);
  };

  return (
    <div>
      <button
        class="dock-button"
        title="显示相关标注"
        onMousedown={onMouseDown}
        onClick={onMouseClick}
      >
        {store.badgeCount}
      </button>
    </div>
  );
};

const DEFAULT_STYLE = {
  top: "auto",
  bottom: "20px",
  right: "20px",
  left: "auto",
};

const InterestItem: FunctionalComponent<{ item: InterestMatchEntry }> = ({
  item,
}) => {
  const match = item.match;
  const hostLabel =
    match.metadata?.host || match.metadata?.url || "已保存的标注";
  const snippet = match.text.slice(0, 140);
  const element = item.element as HTMLElement;

  return (
    <div class="myz-interest-item">
      <div class="myz-interest-meta">
        {hostLabel} · 相似度 {(match.score * 100).toFixed(1)}%
      </div>
      <div class="myz-interest-text">{snippet}</div>
      <div class="myz-interest-actions">
        <button
          class="myz-interest-btn"
          onClick={() => handleInterestClick(match, element)}
        >
          定位当前段落
        </button>
        <button
          class="myz-interest-btn secondary"
          onClick={() => handleOpenPage(match)}
        >
          打开页面
        </button>
      </div>
    </div>
  );
};

export default defineComponent({
  name: "MyZInterests",
  setup() {
    const store = useInterestsStore();
    const interestPopupCollapsed = ref(false);
    const interestResults = computed(() =>
      Array.from(store.interestMatchesByRecord.values()),
    );

    const toggleInterestPopup = (e: Event) => {
      e?.stopPropagation();
      interestPopupCollapsed.value = !interestPopupCollapsed.value;
    };
    const sorted = computed(() =>
      Array.from(interestResults.value).sort(
        (a, b) => (b.match.score || 0) - (a.match.score || 0),
      ),
    );
    const visibleMatches = computed(() =>
      sorted.value.filter(({ element }) => isElementInViewport(element)),
    );
    const topMatches = computed(() => visibleMatches.value.slice(0, 5));
    const remaining = computed(() =>
      Math.max(sorted.value.length - topMatches.value.length, 0),
    );

    const dockPosition = computed(() => {
      const pos = store.dockPosition;
      return {
        top: pos.top === "auto" ? "auto" : `${pos.top * 100}%`,
        left: pos.left === "auto" ? "auto" : `${pos.left * 100}%`,
        right: pos.right === "auto" ? "auto" : `${pos.right * 100}%`,
        bottom: pos.bottom === "auto" ? "auto" : `${pos.bottom * 100}%`,
      };
    });

    return () => {
      return (
        <div
          id="myz-interest-popup"
          class={interestPopupCollapsed.value ? "collapsed" : ""}
          style={
            interestPopupCollapsed.value ? dockPosition.value : DEFAULT_STYLE
          }
        >
          {interestPopupCollapsed.value ? (
            <InterestDock onClick={toggleInterestPopup} />
          ) : (
            <div>
              <div class="myz-interest-header">
                <div class="myz-interest-title">发现与你标注相关的内容</div>
                <div class="myz-interest-badge">{store.badgeCount}</div>
                <button
                  class="myz-interest-close"
                  onClick={toggleInterestPopup}
                >
                  ×
                </button>
              </div>
              <div class="myz-interest-content">
                {topMatches.value.map((item) => (
                  <InterestItem item={item} />
                ))}
              </div>
              {remaining.value > 0 && (
                <div class="myz-interest-footer">
                  <div>
                    还有 {remaining.value} 条相关标注已统计
                    <span
                      class="myz-interest-link"
                      onClick={() =>
                        store.openMatchesInSidepanel(
                          sorted.value.map((m) => m.match),
                        )
                      }
                    >
                      侧边栏查看全部
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    };
  },
});
