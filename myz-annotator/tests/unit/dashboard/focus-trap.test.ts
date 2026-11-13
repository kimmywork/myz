import { describe, expect, it } from "vitest";
import { createFocusTrap } from "@myz/shared/focusTrap";

/**
 * The trap keeps Tab inside the layer. The case these pin down is the dialog's
 * container fallback (§4.8 step 4): the container is focusable but is not part
 * of the cycle, so a plain "is the active element the first control?" test let
 * Shift+Tab walk into the background.
 */
function layer(): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("role", "dialog");
  host.setAttribute("tabindex", "-1");
  host.innerHTML =
    '<button id="one">one</button><input id="two" /><button id="three">three</button>';
  document.body.append(host);
  return host;
}

function tab(shiftKey = false) {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

describe("createFocusTrap", () => {
  it("cycles Tab from the last control to the first", () => {
    const host = layer();
    const trap = createFocusTrap(host);
    trap.activate();
    document.getElementById("three")?.focus();
    tab();
    expect(document.activeElement?.id).toBe("one");
    trap.deactivate();
    host.remove();
  });

  it("cycles Shift+Tab from the first control to the last", () => {
    const host = layer();
    const trap = createFocusTrap(host);
    trap.activate();
    document.getElementById("one")?.focus();
    tab(true);
    expect(document.activeElement?.id).toBe("three");
    trap.deactivate();
    host.remove();
  });

  it("enters the layer on Tab when focus sits on the container", () => {
    const host = layer();
    const trap = createFocusTrap(host);
    trap.activate();
    host.focus();
    const event = tab();
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe("one");
    trap.deactivate();
    host.remove();
  });

  it("stays inside on Shift+Tab from the container", () => {
    const host = layer();
    const trap = createFocusTrap(host);
    trap.activate();
    host.focus();
    const event = tab(true);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe("three");
    trap.deactivate();
    host.remove();
  });

  it("returns focus to the previously focused element on deactivate", () => {
    const opener = document.createElement("button");
    opener.id = "opener";
    document.body.append(opener);
    opener.focus();
    const host = layer();
    const trap = createFocusTrap(host);
    trap.activate();
    expect(document.activeElement).toBe(document.getElementById("one"));
    trap.deactivate();
    expect(document.activeElement).toBe(opener);
    host.remove();
    opener.remove();
  });
});
