import { Check, Copy, Languages, RotateCw, X } from "@lucide/vue";
import {
  computed,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  type PropType,
} from "vue";
import { languageLabel } from "./translate/language.js";
import type { TranslationStatus } from "./translate/useTranslation.js";

const ANCHOR_GAP = 12;
const EDGE_MARGIN = 8;
const MIN_VISIBLE_HEIGHT = 220;
const MAX_VISIBLE_HEIGHT = 560;
const VIEWPORT_RATIO = 0.6;
const HALF_WIDTH = 200;

/**
 * Translation popover: draggable panel with the source quote and the
 * translation, both keeping their paragraph structure. It opens below the
 * selection, flips above when there is more room there, clamps to the viewport
 * and grows up to a share of the viewport so long text scrolls internally
 * instead of running off-screen or covering the page.
 */
export default defineComponent({
  name: "TranslationPopover",
  props: {
    top: { type: Number, required: true },
    left: { type: Number, required: true },
    bottom: { type: Number, required: true },
    sourceText: { type: String, required: true },
    sourceLanguage: { type: String, required: true },
    targetLanguage: { type: String, required: true },
    status: { type: String as PropType<TranslationStatus>, required: true },
    downloadPercent: { type: Number, required: true },
    translation: { type: String, required: true },
    errorMessage: { type: String, required: true },
    copyError: { type: String, required: true },
    copied: { type: Boolean, required: true },
    onCopy: { type: Function as PropType<() => void>, required: true },
    onRetry: { type: Function as PropType<() => void>, required: true },
    onClose: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const root = ref<HTMLElement | null>(null);
    const header = ref<HTMLElement | null>(null);
    const dragging = ref(false);
    const offset = ref({ x: 0, y: 0 });
    const measuredHeight = ref(MIN_VISIBLE_HEIGHT);
    const viewportWidth = ref(
      typeof window === "undefined" ? 1024 : window.innerWidth,
    );
    const viewportHeight = ref(
      typeof window === "undefined" ? 768 : window.innerHeight,
    );
    let resizeObserver: ResizeObserver | null = null;
    let drag: { x: number; y: number; ox: number; oy: number } | null = null;

    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        props.onClose();
      }
    }

    function measure() {
      if (root.value) {
        measuredHeight.value = root.value.offsetHeight;
      }
    }

    function onViewportResize() {
      viewportWidth.value = window.innerWidth;
      viewportHeight.value = window.innerHeight;
    }

    function onPointerDown(event: PointerEvent) {
      if ((event.target as HTMLElement | null)?.closest("button")) {
        return;
      }
      drag = {
        x: event.clientX,
        y: event.clientY,
        ox: offset.value.x,
        oy: offset.value.y,
      };
      dragging.value = true;
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
      event.preventDefault();
    }

    function onPointerMove(event: PointerEvent) {
      if (!drag) {
        return;
      }
      offset.value = {
        x: drag.ox + (event.clientX - drag.x),
        y: drag.oy + (event.clientY - drag.y),
      };
    }

    function onPointerUp() {
      drag = null;
      dragging.value = false;
      window.removeEventListener("pointermove", onPointerMove);
    }

    onMounted(() => {
      window.addEventListener("resize", onViewportResize);
      document.addEventListener("keydown", onKeydown, true);
      header.value?.addEventListener("pointerdown", onPointerDown);
      measure();
      if (typeof ResizeObserver !== "undefined" && root.value) {
        resizeObserver = new ResizeObserver(measure);
        resizeObserver.observe(root.value);
      }
      root.value?.focus();
    });
    onBeforeUnmount(() => {
      window.removeEventListener("resize", onViewportResize);
      document.removeEventListener("keydown", onKeydown, true);
      header.value?.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      resizeObserver?.disconnect();
    });

    // Below by default; flip above when there is more room there.
    const placedAbove = computed(() => {
      const below = viewportHeight.value - props.bottom - ANCHOR_GAP;
      const above = props.top - ANCHOR_GAP;
      return (
        below < Math.min(measuredHeight.value, MIN_VISIBLE_HEIGHT) &&
        above > below
      );
    });

    const top = computed(() => {
      const base = placedAbove.value
        ? props.top - ANCHOR_GAP - measuredHeight.value
        : props.bottom + ANCHOR_GAP;
      const maxTop = Math.max(
        EDGE_MARGIN,
        viewportHeight.value - MIN_VISIBLE_HEIGHT - EDGE_MARGIN,
      );
      return Math.min(Math.max(base + offset.value.y, EDGE_MARGIN), maxTop);
    });

    const halfWidth = computed(() =>
      Math.min(HALF_WIDTH, (viewportWidth.value - 32) / 2),
    );

    const left = computed(() => {
      const center = props.left + offset.value.x;
      return Math.min(
        Math.max(center, halfWidth.value + EDGE_MARGIN),
        viewportWidth.value - halfWidth.value - EDGE_MARGIN,
      );
    });

    const maxHeight = computed(() => {
      const room = viewportHeight.value - top.value - EDGE_MARGIN;
      return Math.max(
        MIN_VISIBLE_HEIGHT * 0.5,
        Math.min(
          MAX_VISIBLE_HEIGHT,
          viewportHeight.value * VIEWPORT_RATIO,
          room,
        ),
      );
    });

    function statusText(): string {
      switch (props.status) {
        case "detecting":
          return "正在识别原文语言…";
        case "downloading":
          return `正在准备语言包 ${props.downloadPercent}%`;
        case "translating":
          return "正在翻译…";
        case "cached":
          return "正在翻译…";
        default:
          return "";
      }
    }

    function langLine(): string {
      const source = props.sourceLanguage
        ? languageLabel(props.sourceLanguage)
        : "检测中";
      return `${source} → ${languageLabel(props.targetLanguage)}`;
    }

    function isBusy(): boolean {
      return (
        props.status === "detecting" ||
        props.status === "downloading" ||
        props.status === "translating"
      );
    }

    return () => (
      <>
        <div class="translation-popover__scrim" onClick={props.onClose} />
        <div
          ref={root}
          class={"translation-popover" + (dragging.value ? " is-dragging" : "")}
          role="dialog"
          tabindex={-1}
          aria-label="翻译"
          style={{
            top: `${top.value}px`,
            left: `${left.value}px`,
            maxHeight: `${maxHeight.value}px`,
            transform: "translateX(-50%)",
          }}
        >
          <div ref={header} class="translation-popover__head" title="拖动">
            <span class="translation-popover__title">
              <Languages size={16} aria-hidden="true" />
              翻译
            </span>
            <span class="translation-popover__langs">{langLine()}</span>
            <button
              type="button"
              class="translation-popover__close"
              aria-label="关闭"
              title="关闭"
              onClick={props.onClose}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          {statusText() ? (
            <div class="translation-popover__status">
              <span>{statusText()}</span>
              {props.status === "downloading" ? (
                <span
                  class="translation-popover__bar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={props.downloadPercent}
                >
                  <span style={{ width: `${props.downloadPercent}%` }} />
                </span>
              ) : null}
            </div>
          ) : null}

          <div class="translation-popover__body">
            <p class="translation-popover__source">{props.sourceText}</p>

            {props.errorMessage ? (
              <p class="translation-popover__error" role="alert">
                {props.errorMessage}
              </p>
            ) : null}

            {props.translation ? (
              <p class="translation-popover__result">{props.translation}</p>
            ) : null}
          </div>

          <div class="translation-popover__actions">
            <button
              type="button"
              class="translation-popover__copy"
              disabled={!props.translation}
              onClick={props.onCopy}
            >
              {props.copied ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Copy size={14} aria-hidden="true" />
              )}
              {props.copied ? "已复制" : "复制"}
            </button>
            {props.errorMessage ? (
              <button
                type="button"
                class="translation-popover__retry"
                onClick={props.onRetry}
              >
                <RotateCw size={14} aria-hidden="true" />
                重试
              </button>
            ) : null}
            {isBusy() ? (
              <button
                type="button"
                class="translation-popover__cancel"
                onClick={props.onClose}
              >
                取消
              </button>
            ) : null}
          </div>

          {props.copyError ? (
            <p class="translation-popover__copy-error" role="alert">
              {props.copyError}
            </p>
          ) : null}
        </div>
      </>
    );
  },
});
