import { defineComponent } from "vue"
import type { PropType, VNodeChild } from "vue"
import "./listRow.css"

/** Left status bar tone (§4.20 / §4.29). */
export type ListRowTone = "info" | "neutral" | "tag" | "danger" | "clip" | "none"

/**
 * A flush list row (§4.20): 56px tall, 1px separator, 3px status bar, one
 * truncated title line and one meta line. Actions are revealed on hover,
 * keyboard focus, selection or active detail; they stay visible on touch.
 *
 * The row itself is not a `<button>` because it contains buttons; it is a
 * focusable `article` with option semantics, and clicks on interactive
 * children do not trigger `onOpen`.
 */
export default defineComponent({
  name: "ListRow",
  props: {
    /** Primary single-line text; also used as the truncation tooltip. */
    title: { type: String, required: true },
    /** Secondary line: source, time, counts. */
    meta: { type: String, default: "" },
    /** Batch selection (checkbox). */
    selected: { type: Boolean, default: false },
    /** Row whose detail is open. */
    active: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    tone: { type: String as PropType<ListRowTone>, default: "neutral" },
    /** Rows can be drag sources (Inbox tag drop targets). */
    draggable: { type: Boolean, default: false },
    onOpen: Function as PropType<() => void>,
    onDragstart: Function as PropType<(event: DragEvent) => void>,
    onDragend: Function as PropType<(event: DragEvent) => void>,
    onDragover: Function as PropType<(event: DragEvent) => void>,
    onDrop: Function as PropType<(event: DragEvent) => void>,
    renderActions: Function as PropType<() => VNodeChild>,
  },
  setup(props, { slots }) {
    function isInteractive(target: EventTarget | null): boolean {
      if (!(target instanceof Element)) return false
      return Boolean(
        target.closest("button, input, select, textarea, a, [data-row-action]"),
      )
    }

    function onActivate(event: MouseEvent) {
      if (props.disabled) return
      if (isInteractive(event.target)) return
      // Focus the row so an overlay panel can restore focus to it on close.
      ;(event.currentTarget as HTMLElement | null)?.focus?.()
      props.onOpen?.()
    }

    function onKeydown(event: KeyboardEvent) {
      if (props.disabled) return
      if (event.key !== "Enter" && event.key !== " ") return
      if (isInteractive(event.target)) return
      event.preventDefault()
      props.onOpen?.()
    }

    return () => (
      <article
        class={[
          "myz-list-row",
          props.selected ? "is-selected" : "",
          props.active ? "is-active" : "",
          props.disabled ? "is-disabled" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="option"
        aria-selected={props.active}
        aria-disabled={props.disabled || undefined}
        tabindex={props.disabled ? -1 : 0}
        draggable={props.draggable || undefined}
        onClick={onActivate}
        onKeydown={onKeydown}
        onDragstart={props.onDragstart}
        onDragend={props.onDragend}
        onDragover={props.onDragover}
        onDrop={props.onDrop}
      >
        {props.tone === "none" ? null : (
          <span
            class={`myz-list-row__bar myz-list-row__bar--${props.tone}`}
            aria-hidden="true"
          />
        )}
        {slots.leading?.()}
        <div class="myz-list-row__main">
          <div class="myz-list-row__top">
            {slots.badges?.()}
            <span class="myz-list-row__title" title={props.title}>
              {props.title}
            </span>
          </div>
          {props.meta ? (
            <div class="myz-list-row__meta" title={props.meta}>
              {props.meta}
            </div>
          ) : null}
        </div>
        {slots.trailing?.()}
        <div class="myz-list-row__actions">
          {props.renderActions?.() ?? slots.actions?.()}
        </div>
      </article>
    )
  },
})
