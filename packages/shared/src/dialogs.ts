/**
 * Confirmation for destructive actions.
 *
 * Hosts register a themed implementation once at their root (`ConfirmHost`);
 * `confirmDestructive` then awaits it. The native `window.confirm` remains
 * only as a fallback for a host that never registered one (tests, future
 * surfaces), never as the intended UI.
 */
export interface ConfirmRequest {
  message: string
  title?: string
  confirmLabel?: string
  cancelLabel?: string
}

export type ConfirmHandler = (request: ConfirmRequest) => Promise<boolean>

let activeHandler: ConfirmHandler | null = null

/** Registers (or clears) the themed confirm implementation for this host. */
export function setConfirmHandler(handler: ConfirmHandler | null): void {
  activeHandler = handler
}

/**
 * Asks the user to confirm a destructive action.
 *
 * @param message Body text.
 * @param options Optional title and button labels.
 * @returns `true` when confirmed.
 */
export async function confirmDestructive(
  message: string,
  options: Omit<ConfirmRequest, "message"> = {},
): Promise<boolean> {
  if (activeHandler) {
    try {
      return await activeHandler({ message, ...options })
    } catch {
      return false
    }
  }
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return true
  }
  return window.confirm(message)
}

export const DELETE_CONFIRM = "删除后不可撤销，确定删除？"
