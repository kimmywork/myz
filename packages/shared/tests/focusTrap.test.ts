import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFocusTrap } from "../src/focusTrap";

function build() {
  const container = document.createElement("div");
  const first = document.createElement("button");
  const middle = document.createElement("input");
  const last = document.createElement("button");
  container.append(first, middle, last);
  document.body.appendChild(container);
  return { container, first, middle, last };
}

describe("createFocusTrap", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("focuses the first focusable on activate", () => {
    const { container, first } = build();
    const trap = createFocusTrap(container);
    trap.activate();
    expect(document.activeElement).toBe(first);
    trap.deactivate();
  });

  it("wraps Tab from the last element to the first", () => {
    const { container, first, last } = build();
    const trap = createFocusTrap(container);
    trap.activate();
    last.focus();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(document.activeElement).toBe(first);
    trap.deactivate();
  });

  it("wraps Shift+Tab from the first element to the last", () => {
    const { container, first, last } = build();
    const trap = createFocusTrap(container);
    trap.activate();
    first.focus();
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(document.activeElement).toBe(last);
    trap.deactivate();
  });

  it("calls onEscape and restores focus on deactivate", () => {
    const { container } = build();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    const onEscape = vi.fn();
    const trap = createFocusTrap(container, { onEscape });
    trap.activate();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(onEscape).toHaveBeenCalledTimes(1);
    trap.deactivate();
    expect(document.activeElement).toBe(outside);
  });
});
