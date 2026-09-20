import { Inbox, RefreshCw, TriangleAlert } from "@lucide/vue"
import type { LucideIcon } from "@lucide/vue"
import { defineComponent } from "vue"
import type { PropType } from "vue"

export type StateKind = "empty" | "loading" | "error"

/**
 * Design-system §4.15 empty / loading / error state.
 *
 * Renders in place (inline, panel or full screen) depending on the caller's
 * `class`. Loading shows skeleton lines at content height; empty and error show
 * an icon, one status line and one next step.
 */
export default defineComponent({
  name: "StatePanel",
  props: {
    kind: {
      type: String as PropType<StateKind>,
      default: "empty",
    },
    title: {
      type: String,
      default: "",
    },
    hint: {
      type: String,
      default: "",
    },
    icon: {
      type: [Object, Function] as PropType<LucideIcon | undefined>,
      default: undefined,
    },
    actionLabel: {
      type: String,
      default: "",
    },
    actionIcon: {
      type: [Object, Function] as PropType<LucideIcon | undefined>,
      default: undefined,
    },
    onAction: {
      type: Function as PropType<(() => void) | undefined>,
      default: undefined,
    },
    class: {
      type: String,
      default: "",
    },
  },
  setup(props) {
    const buttonClass =
      "mt-2 inline-flex h-8 items-center gap-1.5 rounded-control border border-control-border bg-control-bg px-3 text-label font-semibold text-text transition hover:border-accent hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"

    return () => {
      if (props.kind === "loading") {
        return (
          <div
            class={[
              "flex flex-col items-center gap-3 rounded-panel border border-line bg-surface p-8",
              props.class,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div class="w-full max-w-xs space-y-2">
              <div class="h-3 w-[70%] animate-pulse rounded-tag bg-skeleton" />
              <div class="h-3 w-[45%] animate-pulse rounded-tag bg-skeleton" />
            </div>
            {props.title ? (
              <p class="text-caption text-muted">{props.title}</p>
            ) : null}
          </div>
        )
      }

      const Icon =
        props.icon ?? (props.kind === "error" ? TriangleAlert : Inbox)
      const ActionIcon =
        props.actionIcon ?? (props.kind === "error" ? RefreshCw : undefined)
      return (
        <div
          class={[
            "flex flex-col items-center justify-center gap-2 rounded-panel border border-line bg-surface p-8 text-center",
            props.class,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Icon
            size={22}
            class={props.kind === "error" ? "text-error" : "text-muted"}
            aria-hidden="true"
          />
          {props.title ? (
            <p class="text-compact text-text">{props.title}</p>
          ) : null}
          {props.hint ? (
            <p class="text-caption text-muted">{props.hint}</p>
          ) : null}
          {props.actionLabel && props.onAction ? (
            <button
              type="button"
              class={buttonClass}
              onClick={() => props.onAction?.()}
            >
              {ActionIcon ? <ActionIcon size={16} aria-hidden="true" /> : null}
              {props.actionLabel}
            </button>
          ) : null}
        </div>
      )
    }
  },
})
