import { Check, ChevronDown, Languages, RotateCw } from "@lucide/vue";
import {
  computed,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  type PropType,
} from "vue";
import type { BilingualPhase } from "./translate/bilingual.js";
import {
  TARGET_LANGUAGE_OPTIONS,
  languageLabel,
  targetLanguageLabel,
} from "./translate/language.js";

/**
 * Toolbar control for the bilingual reading mode.
 *
 * Behaviour mirrors the reference reader: the first "对照翻译" click opens the
 * language menu (there is no remembered language yet); after that the same
 * button turns the mode straight on with the remembered target, and while it is
 * on it becomes "关闭翻译". The caret is the only way to change languages, so
 * an enabled mode is never interrupted by a menu. The menu also carries the
 * auto-detected source language, a re-detect action, the status and a retry.
 */
export default defineComponent({
  name: "BilingualControl",
  props: {
    enabled: { type: Boolean, required: true },
    phase: { type: String as PropType<BilingualPhase>, required: true },
    sourceLanguage: { type: String, required: true },
    targetLanguage: { type: String, required: true },
    error: { type: String, required: true },
    downloadPercent: { type: Number, required: true },
    translated: { type: Number, required: true },
    /** Whether a target language has been picked before (menu on first use). */
    hasTarget: { type: Boolean, required: true },
    disabled: { type: Boolean, default: false },
    onEnable: { type: Function as PropType<() => void>, required: true },
    onToggle: { type: Function as PropType<() => void>, required: true },
    onSelectTarget: {
      type: Function as PropType<(tag: string) => void>,
      required: true,
    },
    onRedetect: { type: Function as PropType<() => void>, required: true },
    onRetry: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const root = ref<HTMLElement | null>(null);
    const open = ref(false);

    const chosenTarget = computed(() =>
      targetLanguageLabel(props.targetLanguage),
    );

    function handleDocumentPointerDown(event: PointerEvent) {
      if (!root.value?.contains(event.target as Node)) {
        open.value = false;
      }
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape" && open.value) {
        event.stopPropagation();
        open.value = false;
      }
    }

    function toggleMenu() {
      if (props.disabled) return;
      open.value = !open.value;
    }

    function onMainClick() {
      if (props.disabled) return;
      if (props.enabled) {
        props.onToggle();
        open.value = false;
        return;
      }
      if (props.hasTarget) {
        props.onEnable();
        open.value = false;
        return;
      }
      open.value = !open.value;
    }

    function selectTarget(tag: string) {
      props.onSelectTarget(tag);
      open.value = false;
    }

    function statusText(): string {
      switch (props.phase) {
        case "detecting":
          return "正在识别原文语言…";
        case "downloading":
          return `正在准备语言包 ${props.downloadPercent}%`;
        case "translating":
          return `正在翻译…（已译 ${props.translated} 段）`;
        case "ready":
          return props.translated
            ? `已翻译 ${props.translated} 段`
            : "已开启对照翻译";
        default:
          return "";
      }
    }

    onMounted(() => {
      document.addEventListener("pointerdown", handleDocumentPointerDown);
      document.addEventListener("keydown", handleKeydown, true);
    });
    onBeforeUnmount(() => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleKeydown, true);
    });

    return () => (
      <div class="myz-bilingual-control" ref={root}>
        <button
          type="button"
          class={
            "myz-bilingual-control__toggle" +
            (props.enabled ? " is-active" : "")
          }
          title={
            props.enabled
              ? "关闭对照翻译"
              : props.hasTarget
                ? `对照翻译（${chosenTarget.value}）`
                : "对照翻译"
          }
          aria-haspopup="menu"
          aria-expanded={open.value}
          disabled={props.disabled}
          onClick={onMainClick}
        >
          <Languages size={16} aria-hidden="true" />
          {props.enabled ? "关闭翻译" : "对照翻译"}
        </button>
        <button
          type="button"
          class="myz-bilingual-control__caret"
          title="切换翻译语言"
          aria-label="选择翻译语言"
          aria-haspopup="menu"
          aria-expanded={open.value}
          disabled={props.disabled}
          onClick={toggleMenu}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>

        {open.value ? (
          <div class="myz-bilingual-menu" role="menu" aria-label="对照翻译">
            {" "}
            <div class="myz-bilingual-menu__head">
              <span class="myz-bilingual-menu__title">
                <Languages size={15} aria-hidden="true" />
                对照翻译
              </span>
              <span class="myz-bilingual-menu__pair">
                {props.sourceLanguage
                  ? languageLabel(props.sourceLanguage)
                  : "自动检测"}{" "}
                → {chosenTarget.value}
              </span>
            </div>
            <div class="myz-bilingual-menu__section">
              <span class="myz-bilingual-menu__label">原文语言</span>
              <button
                type="button"
                class="myz-bilingual-menu__option is-selected"
                role="menuitemradio"
                aria-checked="true"
                onClick={() => props.onRedetect()}
                title={
                  props.enabled ? "重新检测原文语言" : "翻译时自动识别原文语言"
                }
              >
                <Check size={14} aria-hidden="true" />
                <span class="myz-bilingual-menu__option-label">
                  自动检测
                  {props.sourceLanguage
                    ? `（${languageLabel(props.sourceLanguage)}）`
                    : ""}
                </span>
                {props.enabled ? (
                  <RotateCw
                    size={13}
                    aria-hidden="true"
                    class="myz-bilingual-menu__refresh"
                  />
                ) : null}
              </button>
            </div>
            <div class="myz-bilingual-menu__section">
              <span class="myz-bilingual-menu__label">目标语言</span>
              <div class="myz-bilingual-menu__list">
                {TARGET_LANGUAGE_OPTIONS.map((option) => {
                  const selected =
                    option.tag.toLowerCase() ===
                    props.targetLanguage.toLowerCase();
                  return (
                    <button
                      key={option.tag}
                      type="button"
                      class={
                        "myz-bilingual-menu__option" +
                        (selected ? " is-selected" : "")
                      }
                      role="menuitemradio"
                      aria-checked={selected ? "true" : "false"}
                      onClick={() => selectTarget(option.tag)}
                    >
                      <Check
                        size={14}
                        aria-hidden="true"
                        class={selected ? "" : "is-hidden"}
                      />
                      <span class="myz-bilingual-menu__option-label">
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {statusText() ? (
              <p class="myz-bilingual-menu__status">{statusText()}</p>
            ) : null}
            {props.error ? (
              <p class="myz-bilingual-menu__error" role="alert">
                <span>{props.error}</span>
                <button type="button" onClick={() => props.onRetry()}>
                  重试
                </button>
              </p>
            ) : null}
          </div>
        ) : null}

        {!open.value && props.enabled && props.error ? (
          <div class="myz-bilingual-alert" role="alert" title={props.error}>
            <span class="myz-bilingual-alert__text">{props.error}</span>
            <button
              type="button"
              class="myz-bilingual-alert__retry"
              onClick={() => props.onRetry()}
            >
              重试
            </button>
          </div>
        ) : null}
      </div>
    );
  },
});
