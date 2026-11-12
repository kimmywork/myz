import { defineComponent, h } from "vue"
import type { PropType, VNodeChild } from "vue"

/** §4.4 button variants. */
export type ButtonVariant = "default" | "primary" | "secondary" | "danger" | "link"

/** §4.4 heights: 36 regular, 32 small. */
export type ButtonSize = "md" | "sm"

/**
 * The one button primitive (§4.4).
 *
 * It replaces the `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-danger` /
 * `.btn-small` / `.btn-link` class family, and it carries **exactly** the same
 * token classes those did: adopting it must not move a pixel or change a
 * behaviour. That is why the classes live here verbatim instead of being
 * "improved" on the way in.
 *
 * Renders `<button>` unless `href` is given, in which case it renders `<a>` —
 * an action that navigates should be a link for keyboard and middle-click
 * users, and a disabled link gets `aria-disabled` instead of a dead `href`.
 *
 * ## Inventory this covers (measured before writing it)
 *
 * The dashboard uses exactly these combinations, so the component has exactly
 * these: `default | primary | secondary | danger | link` × `md (36) | sm (32)`.
 * There is no 28 or 44 button in the app, and no `ghost` or `block` variant —
 * those belong to the stitch editor, which keeps its own `.stitch-btn-*` set.
 *
 * Two classes in the old usage, `btn-link--muted` and `btn-link--danger`, are
 * not defined anywhere in CSS; their appearance comes from the `text-*`
 * utilities passed alongside them. The component drops the dead class and
 * keeps the effective styling through `attrs.class`, so nothing changes
 * visually.
 */
export default defineComponent({
  name: "Button",
  props: {
    variant: {
      type: String as PropType<ButtonVariant>,
      default: "default",
    },
    size: {
      type: String as PropType<ButtonSize>,
      default: "md",
    },
    /** Renders an anchor instead of a button. */
    href: { type: String, default: "" },
    disabled: { type: Boolean, default: false },
    /** Native `type`; defaults to `button` so forms do not submit by accident. */
    type: {
      type: String as PropType<"button" | "submit" | "reset">,
      default: "button",
    },
    ariaLabel: { type: String, default: "" },
    /** Declared so callers type-check under Vue's JSX props rules. */
    onClick: Function as PropType<(event: MouseEvent) => void>,
  },
  setup(props, { slots, attrs }) {
    const variantClass: Record<ButtonVariant, string> = {
      default: "",
      primary: "btn-primary",
      secondary: "btn-secondary",
      danger: "btn-danger",
      link: "btn-link",
    }

    return (): VNodeChild => {
      const classes = [
        "btn",
        variantClass[props.variant],
        props.size === "sm" ? "btn-small" : "",
        attrs.class,
      ]
        .filter(Boolean)
        .join(" ")

      const { class: _class, onClick: _attrClick, ...rest } = attrs

      if (props.href) {
        return h(
          "a",
          {
            ...rest,
            class: classes,
            href: props.disabled ? undefined : props.href,
            "aria-disabled": props.disabled ? "true" : undefined,
            "aria-label": props.ariaLabel || undefined,
            rel: "noreferrer",
            onClick: props.onClick,
          },
          slots.default?.(),
        )
      }

      return h(
        "button",
        {
          ...rest,
          class: classes,
          type: props.type,
          disabled: props.disabled || undefined,
          "aria-label": props.ariaLabel || undefined,
          onClick: props.onClick,
        },
        slots.default?.(),
      )
    }
  },
})
