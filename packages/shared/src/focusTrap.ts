const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

export interface FocusTrapOptions {
  /** Called when Escape is pressed while the trap is active. */
  onEscape?: () => void
  /** Element to focus on activate; defaults to the first focusable. */
  initialFocus?: HTMLElement | null
}

export interface FocusTrap {
  activate(): void
  deactivate(): void
}

/**
 * Keeps Tab/Shift+Tab inside `container` and restores focus to the previously
 * focused element on deactivate. Works with content in a shadow root because it
 * operates on descendant nodes, not the document.
 */
export function createFocusTrap(
  container: HTMLElement,
  options: FocusTrapOptions = {},
): FocusTrap {
  let previouslyFocused: HTMLElement | null = null

  function focusable(): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    )
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      options.onEscape?.()
      return
    }
    if (event.key !== "Tab") return
    const items = focusable()
    if (!items.length) {
      event.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = (container.getRootNode() as Document | ShadowRoot)
      .activeElement as HTMLElement | null
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return {
    activate() {
      previouslyFocused = (container.getRootNode() as Document | ShadowRoot)
        .activeElement as HTMLElement | null
      document.addEventListener("keydown", onKeydown, true)
      const target = options.initialFocus ?? focusable()[0]
      target?.focus()
    },
    deactivate() {
      document.removeEventListener("keydown", onKeydown, true)
      previouslyFocused?.focus?.()
      previouslyFocused = null
    },
  }
}
