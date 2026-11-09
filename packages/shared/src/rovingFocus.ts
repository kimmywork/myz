/**
 * Keyboard navigation for `role="radiogroup"` widgets.
 *
 * Arrow keys move the selection (wrapping at both ends), Home/End jump to the
 * first/last option, and focus follows the selection. The caller owns the
 * container ref and applies the returned index to its own model.
 */
const NAV_KEYS = [
  "ArrowRight",
  "ArrowDown",
  "ArrowLeft",
  "ArrowUp",
  "Home",
  "End",
] as const;

export function handleRovingRadioKeydown(
  container: HTMLElement | null,
  event: KeyboardEvent,
  onSelect: (index: number) => void,
): void {
  if (!NAV_KEYS.includes(event.key as (typeof NAV_KEYS)[number])) {
    return;
  }
  const buttons = Array.from(
    container?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
  );
  const count = buttons.length;
  if (!count) {
    return;
  }
  event.preventDefault();
  const current = buttons.indexOf(event.target as HTMLElement);
  let next = current < 0 ? 0 : current;
  if (event.key === "Home") {
    next = 0;
  } else if (event.key === "End") {
    next = count - 1;
  } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    next = (current + 1 + count) % count;
  } else {
    next = (current - 1 + count) % count;
  }
  onSelect(next);
  buttons[next]?.focus();
}
