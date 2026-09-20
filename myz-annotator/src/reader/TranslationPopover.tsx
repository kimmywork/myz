import { Check, Copy, Languages, RotateCw, X } from "@lucide/vue";
import {
  defineComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  type PropType,
} from "vue";
import { languageLabel } from "./translate/language.js";
import type { TranslationStatus } from "./translate/useTranslation.js";

/**
 * Presentational translation popover: source quote, detected/target languages,
 * progress, the translation, copy and retry. All state arrives via props; the
 * host wires it to `useTranslation`.
 */
export default defineComponent({
  name: "TranslationPopover",
  props: {
    top: { type: Number, required: true },
    left: { type: Number, required: true },
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

    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        props.onClose();
      }
    }

    onMounted(() => {
      document.addEventListener("keydown", onKeydown, true);
      root.value?.focus();
    });
    onBeforeUnmount(() => {
      document.removeEventListener("keydown", onKeydown, true);
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
          class="translation-popover"
          role="dialog"
          tabindex={-1}
          aria-label="翻译"
          style={{
            top: `${props.top}px`,
            // Keep the 320px panel on-screen when the selection sits near an
            // edge; clamp the center to half the panel width from each side.
            left: `clamp(160px, ${props.left}px, calc(100vw - 160px))`,
          }}
        >
          <div class="translation-popover__head">
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

          <p class="translation-popover__source">{props.sourceText}</p>

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

          {props.errorMessage ? (
            <p class="translation-popover__error" role="alert">
              {props.errorMessage}
            </p>
          ) : null}

          {props.translation ? (
            <p class="translation-popover__result">{props.translation}</p>
          ) : null}

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
