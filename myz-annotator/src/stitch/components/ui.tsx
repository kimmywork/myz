/* eslint-disable vue/one-component-per-file -- primitives barrel, mirrors stitch-web's ui.tsx */
/**
 * Presentational UI primitives for the stitch editor — a Vue 3 JSX port of
 * stitch-web's `components/ui.tsx`. Controls are controlled: they take a value
 * and emit `change`.
 */
import { defineComponent, ref, type PropType, type VNode } from "vue";

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: VNode | null;
  hint?: string;
}

export const Segmented = defineComponent({
  name: "StitchSegmented",
  props: {
    value: { type: String, required: true },
    options: { type: Array as PropType<SegmentedOption[]>, required: true },
    size: { type: String as PropType<"sm" | "md">, default: "md" },
    wrap: { type: Boolean, default: false },
  },
  emits: ["change"],
  setup(props, { emit }) {
    return () => (
      <div
        class={[
          "seg",
          props.size === "sm" ? "seg-sm" : "",
          props.wrap ? "seg-wrap" : "",
        ]}
        role="tablist"
      >
        {props.options.map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.hint}
            role="tab"
            aria-selected={option.value === props.value}
            class={[
              "seg-item",
              option.value === props.value ? "is-active" : "",
            ]}
            onClick={() => emit("change", option.value)}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    );
  },
});

export const Field = defineComponent({
  name: "StitchField",
  props: {
    label: { type: String, default: "" },
    hint: { type: String, default: "" },
  },
  setup(props, { slots }) {
    return () => (
      <label class="field">
        {props.label ? <span class="field-label">{props.label}</span> : null}
        {slots.default?.()}
        {props.hint ? <span class="field-hint">{props.hint}</span> : null}
      </label>
    );
  },
});

export const Slider = defineComponent({
  name: "StitchSlider",
  props: {
    label: { type: String, required: true },
    value: { type: Number, required: true },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    step: { type: Number, default: 1 },
    disabled: { type: Boolean, default: false },
    format: {
      type: Function as PropType<(v: number) => string>,
      default: null,
    },
  },
  emits: ["change"],
  setup(props, { emit }) {
    return () => (
      <div class={["slider", props.disabled ? "is-disabled" : ""]}>
        <div class="slider-head">
          <span class="slider-label">{props.label}</span>
          <span class="slider-value">
            {props.format ? props.format(props.value) : props.value}
          </span>
        </div>
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          disabled={props.disabled}
          onChange={(event: Event) =>
            emit("change", Number((event.target as HTMLInputElement).value))
          }
        />
      </div>
    );
  },
});

export const Toggle = defineComponent({
  name: "StitchToggle",
  props: {
    label: { type: String, required: true },
    checked: { type: Boolean, required: true },
    hint: { type: String, default: "" },
  },
  emits: ["change"],
  setup(props, { emit }) {
    return () => (
      <button
        type="button"
        class="toggle-row"
        onClick={() => emit("change", !props.checked)}
      >
        <span class="toggle-text">
          <span>{props.label}</span>
          {props.hint ? <span class="field-hint">{props.hint}</span> : null}
        </span>
        <span class={["switch", props.checked ? "is-on" : ""]}>
          <span class="switch-knob" />
        </span>
      </button>
    );
  },
});

export const ColorField = defineComponent({
  name: "StitchColorField",
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
  },
  emits: ["change"],
  setup(props, { emit }) {
    return () => (
      <div class="color-field">
        <span class="field-label">{props.label}</span>
        <span class="color-input">
          <input
            type="color"
            value={props.value}
            onChange={(event: Event) =>
              emit("change", (event.target as HTMLInputElement).value)
            }
          />
          <span class="color-hex">{props.value.toUpperCase()}</span>
        </span>
      </div>
    );
  },
});

export const Button = defineComponent({
  name: "StitchButton",
  props: {
    variant: {
      type: String as PropType<"default" | "primary" | "ghost" | "danger">,
      default: "default",
    },
    icon: { type: Object as PropType<VNode | null>, default: null },
    disabled: { type: Boolean, default: false },
    block: { type: Boolean, default: false },
    title: { type: String, default: "" },
    type: { type: String as PropType<"button" | "submit">, default: "button" },
  },
  emits: ["click"],
  setup(props, { emit, slots }) {
    return () => (
      <button
        type={props.type}
        title={props.title}
        disabled={props.disabled}
        class={["btn", `btn-${props.variant}`, props.block ? "btn-block" : ""]}
        onClick={() => emit("click")}
      >
        {props.icon}
        {slots.default ? <span>{slots.default()}</span> : null}
      </button>
    );
  },
});

export const Select = defineComponent({
  name: "StitchSelect",
  props: {
    value: { type: String, required: true },
    options: {
      type: Array as PropType<{ value: string; label: string }[]>,
      required: true,
    },
  },
  emits: ["change"],
  setup(props, { emit }) {
    return () => (
      <select
        class="select"
        value={props.value}
        onChange={(event: Event) =>
          emit("change", (event.target as HTMLSelectElement).value)
        }
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  },
});

export const TextInput = defineComponent({
  name: "StitchTextInput",
  props: {
    label: { type: String, default: "" },
    value: { type: String, required: true },
    placeholder: { type: String, default: "" },
  },
  emits: ["change"],
  setup(props, { emit }) {
    return () => (
      <label class="field">
        {props.label ? <span class="field-label">{props.label}</span> : null}
        <input
          class="text-input"
          type="text"
          value={props.value}
          placeholder={props.placeholder}
          onChange={(event: Event) =>
            emit("change", (event.target as HTMLInputElement).value)
          }
        />
      </label>
    );
  },
});

export const Panel = defineComponent({
  name: "StitchPanel",
  props: {
    title: { type: String, required: true },
    actions: { type: Object as PropType<VNode | null>, default: null },
    defaultOpen: { type: Boolean, default: true },
  },
  setup(props, { slots }) {
    const open = ref(props.defaultOpen);
    return () => (
      <section class={["panel", open.value ? "is-open" : ""]}>
        <header class="panel-head">
          <button
            type="button"
            class="panel-title"
            onClick={() => (open.value = !open.value)}
          >
            <span class={["panel-caret", open.value ? "is-open" : ""]} />
            {props.title}
          </button>
          {props.actions ? (
            <div class="panel-actions">{props.actions}</div>
          ) : null}
        </header>
        {open.value ? <div class="panel-body">{slots.default?.()}</div> : null}
      </section>
    );
  },
});
