/**
 * Visibility checks shared by the content-script capture / AI helpers.
 *
 * `inViewport` is opt-in: composer discovery only cares that an element is
 * rendered, while media capture must ignore off-screen players.
 */
export interface VisibilityOptions {
  /** Require the element to intersect the current viewport. */
  inViewport?: boolean;
  /** Minimum rendered width in CSS pixels. */
  minWidth?: number;
  /** Minimum rendered height in CSS pixels. */
  minHeight?: number;
}

/** Returns whether an element is rendered, optionally requiring it to be in the viewport. */
export function isVisible(
  element: Element,
  options: VisibilityOptions = {},
): boolean {
  const { inViewport = false, minWidth = 1, minHeight = 1 } = options;
  const rect = element.getBoundingClientRect();
  if (rect.width < minWidth || rect.height < minHeight) return false;
  const style = getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none") return false;
  if (!inViewport) return true;
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}
