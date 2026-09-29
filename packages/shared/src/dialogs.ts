/**
 * Confirmation for destructive actions. Centralized so every host uses the same
 * guard (native confirm is the lowest common denominator across extension
 * surfaces; callers may replace it with a custom dialog later).
 */
export function confirmDestructive(message: string): boolean {
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return true;
  }
  return window.confirm(message);
}

export const DELETE_CONFIRM = "删除后不可撤销，确定删除？";
