/* eslint-disable vue/one-component-per-file -- cohesive set of tiny wizard primitives */
import { ClipboardCopy, Cloud, type LucideIcon } from "@lucide/vue";
import { defineComponent } from "vue";
import type { PropType } from "vue";
import { setupInputClass } from "./SetupS3Fields.jsx";
import type { SetupWizardApi } from "./useSetupWizard.js";
import type { Tone } from "./wizard-types.js";

const NOTICE_BASE =
  "flex items-start gap-2 rounded-control border px-3 py-2 text-caption";
const NOTICE_TONE: Record<Tone, string> = {
  error: "border-error-border bg-error-bg text-error",
  success: "border-success-border bg-success-bg text-success",
  warn: "border-warn-border bg-warn-bg text-warn",
  info: "border-line bg-surface-2 text-muted",
};

/** Inline status/instruction banner. */
export const Notice = defineComponent({
  name: "WizardNotice",
  props: {
    tone: { type: String as PropType<Tone>, default: "info" },
    icon: {
      type: [Object, Function] as PropType<LucideIcon | undefined>,
      default: undefined,
    },
  },
  setup(props, { slots }) {
    return () => {
      const Icon = props.icon ?? Cloud;
      return (
        <div class={`${NOTICE_BASE} ${NOTICE_TONE[props.tone]}`}>
          <Icon size={15} aria-hidden="true" class="mt-0.5 shrink-0" />
          <div class="min-w-0">{slots.default?.()}</div>
        </div>
      );
    };
  },
});

/** Six-digit short authentication string, spaced for reading aloud. */
export const SasDisplay = defineComponent({
  name: "WizardSasDisplay",
  props: {
    label: { type: String, required: true },
    sas: { type: String, required: true },
  },
  setup(props) {
    return () => (
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-caption text-muted">{props.label}</span>
        <span class="text-title font-semibold tracking-[0.25em] text-text">
          {props.sas}
        </span>
      </div>
    );
  },
});

/** Copy button with a transient "已复制" state. */
export const CopyButton = defineComponent({
  name: "WizardCopyButton",
  props: {
    label: { type: String, required: true },
    text: { type: String, required: true },
    copied: { type: String, default: "" },
    onCopy: {
      type: Function as PropType<(label: string, text: string) => void>,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <button
        class="btn btn-small shrink-0"
        type="button"
        disabled={!props.text}
        onClick={() => props.onCopy(props.label, props.text)}
      >
        <ClipboardCopy size={14} aria-hidden="true" />
        {props.copied === props.label ? "已复制" : "复制"}
      </button>
    );
  },
});

/** Read-only labelled output with a copy button. */
export const OutputBlock = defineComponent({
  name: "WizardOutputBlock",
  props: {
    label: { type: String, required: true },
    text: { type: String, required: true },
    rows: { type: Number, default: 3 },
    copied: { type: String, default: "" },
    onCopy: {
      type: Function as PropType<(label: string, text: string) => void>,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-caption font-medium text-text">{props.label}</span>
          <CopyButton
            label={props.label}
            text={props.text}
            copied={props.copied}
            onCopy={props.onCopy}
          />
        </div>
        <textarea
          readonly
          rows={props.rows}
          aria-label={props.label}
          class={`${setupInputClass} font-mono text-tag`}
          value={props.text}
        />
      </div>
    );
  },
});

/** Back / next action row shared by every step. */
export const WizardFooter = defineComponent({
  name: "WizardFooter",
  props: {
    wizard: { type: Object as PropType<SetupWizardApi>, required: true },
  },
  setup(props, { slots }) {
    return () => {
      const w = props.wizard;
      const atFirstStep = w.step.value === 0;
      return (
        <div class="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <button
            class="btn btn-secondary"
            type="button"
            disabled={w.isBusy.value}
            onClick={() => (atFirstStep ? w.backToSelect() : w.back())}
          >
            {atFirstStep ? "返回" : "上一步"}
          </button>
          <div class="flex flex-wrap items-center gap-2">
            {slots.default?.()}
          </div>
        </div>
      );
    };
  },
});
