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

/** Active traps, innermost last. Only the top one reacts to keys. */
const trapStack: FocusTrap[] = []

/**
 * Whether an element can really take focus. `:disabled` also covers a control
 * disabled by an ancestor `<fieldset>`; the ancestor walk covers `display:none`
 * on a parent, which does not show up in the child's own computed style.
 * Layout-free on purpose, so it also works in jsdom.
 */
export function isUsableFocusTarget(element: HTMLElement): boolean {
  if (element.matches(":disabled")) return false
  if (element.getAttribute("aria-disabled") === "true") return false
  let node: HTMLElement | null = element
  while (node) {
    if (node.hasAttribute("hidden")) return false
    const style = getComputedStyle(node)
    if (style.display === "none") return false
    if (style.visibility === "hidden" || style.visibility === "collapse") {
      return false
    }
    node = node.parentElement
  }
  return true
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
  let self: FocusTrap

  function focusable(): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter(isUsableFocusTarget)
  }

  /** A trap stacked above this one owns the keyboard (§4.18 nested layers). */
  function isInnermost(): boolean {
    return trapStack[trapStack.length - 1] === self
  }

  function onKeydown(event: KeyboardEvent) {
    // Without this, a confirm layer opened inside a dialog gets Tab handled by
    // BOTH traps: the outer one wraps focus back to its own first control and
    // the user lands outside the layer they are looking at.
    if (!isInnermost()) return
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
    // The dialog's last-resort landing spot is the container itself, which is
    // focusable but deliberately not part of the cycle. Tab from there must
    // still enter the layer instead of walking into the background.
    if (items.indexOf(active as HTMLElement) < 0) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
      return
    }
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  self = {
    activate() {
      previouslyFocused = (container.getRootNode() as Document | ShadowRoot)
        .activeElement as HTMLElement | null
      const index = trapStack.indexOf(self)
      if (index >= 0) trapStack.splice(index, 1)
      trapStack.push(self)
      document.addEventListener("keydown", onKeydown, true)
      const target = options.initialFocus ?? focusable()[0]
      target?.focus()
    },
    deactivate() {
      document.removeEventListener("keydown", onKeydown, true)
      const index = trapStack.indexOf(self)
      if (index >= 0) trapStack.splice(index, 1)
      previouslyFocused?.focus?.()
      previouslyFocused = null
    },
  }
  return self
}
