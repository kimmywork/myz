import { defineComponent, h } from "vue"
import type { Component, PropType } from "vue"

export type StatusPillTone = "info" | "neutral" | "tag" | "danger"
export type StatusPillSize = "row" | "panel" | "count"

const TONE_CLASSES: Record<StatusPillTone, string> = {
  info: "bg-info-bg text-info",
  neutral: "bg-surface-2 text-muted",
  tag: "bg-tag-bg text-tag-fg",
  danger: "bg-error-bg text-error",
}

const SIZE_CLASSES: Record<StatusPillSize, string> = {
  row: "h-[18px] px-1.5 text-tag",
  panel: "h-5 px-1.5 text-tag",
  count: "h-4 px-1.5 text-tag border border-line bg-transparent",
}

/**
 * The single status pill style for the workspace (§4.29): four semantic
 * tones, three sizes. No border except the count variant.
 */
export default defineComponent({
  name: "StatusPill",
  props: {
    label: { type: String, required: true },
    tone: { type: String as PropType<StatusPillTone>, default: "neutral" },
    size: { type: String as PropType<StatusPillSize>, default: "row" },
    icon: {
      type: [Object, Function] as PropType<Component | undefined>,
      default: undefined,
    },
  },
  setup(props) {
    return () => (
      <span
        class={[
          "inline-flex items-center gap-1 rounded-tag font-medium",
          TONE_CLASSES[props.tone],
          SIZE_CLASSES[props.size],
        ].join(" ")}
      >
        {props.icon
          ? h(props.icon, { size: 12, "aria-hidden": true })
          : null}
        {props.label}
      </span>
    )
  },
})
