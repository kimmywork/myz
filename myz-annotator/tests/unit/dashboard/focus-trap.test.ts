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

  it("keeps Tab inside the inner trap while a parent trap is open", () => {
    const parent = document.createElement("div");
    parent.setAttribute("tabindex", "-1");
    parent.innerHTML = '<button id="p1">p1</button><button id="p2">p2</button>';
    document.body.append(parent);
    const child = document.createElement("div");
    child.setAttribute("tabindex", "-1");
    child.innerHTML =
      '<button id="c1">c1</button><button id="c2">c2</button><button id="c3">c3</button>';
    document.body.append(child);

    const outer = createFocusTrap(parent);
    outer.activate();
    const inner = createFocusTrap(child);
    inner.activate();
    expect(document.activeElement?.id).toBe("c1");

    // jsdom does not move focus on Tab, so what matters here is WHO handles
    // it: while the child is innermost the parent must not hijack the key
    // (which is what made forward Tab bounce between c1 and c1).
    const mid = tab();
    expect(mid.defaultPrevented).toBe(false);
    expect(document.activeElement?.id).toBe("c1");

    // At the child's edges the child wraps, and only the child.
    document.getElementById("c3")?.focus();
    tab();
    expect(document.activeElement?.id).toBe("c1");
    tab(true);
    expect(document.activeElement?.id).toBe("c3");
    expect(parent.contains(document.activeElement)).toBe(false);

    inner.deactivate();
    expect(parent.contains(document.activeElement)).toBe(true);
    outer.deactivate();
    parent.remove();
    child.remove();
  });

  it("returns to the parent trap after the inner one closes", () => {
    const parent = document.createElement("div");
    parent.setAttribute("tabindex", "-1");
    parent.innerHTML = '<button id="p1">p1</button><button id="p2">p2</button>';
    document.body.append(parent);
    const child = document.createElement("div");
    child.setAttribute("tabindex", "-1");
    child.innerHTML = '<button id="c1">c1</button>';
    document.body.append(child);

    const outer = createFocusTrap(parent);
    outer.activate();
    document.getElementById("p2")?.focus();
    const inner = createFocusTrap(child);
    inner.activate();
    inner.deactivate();
    expect(document.activeElement?.id).toBe("p2");
    tab();
    expect(document.activeElement?.id).toBe("p1");
    outer.deactivate();
    parent.remove();
    child.remove();
  });

  it("does not restore focus when a parent trap closes under an open child", () => {
    const opener = document.createElement("button");
    opener.id = "opener";
    document.body.append(opener);
    opener.focus();
    const parent = document.createElement("div");
    parent.setAttribute("tabindex", "-1");
    parent.innerHTML = '<button id="p1">p1</button>';
    document.body.append(parent);
    const child = document.createElement("div");
    child.setAttribute("tabindex", "-1");
    child.innerHTML = '<button id="c1">c1</button><button id="c2">c2</button>';
    document.body.append(child);

    const outer = createFocusTrap(parent);
    outer.activate();
    const inner = createFocusTrap(child);
    inner.activate();
    expect(document.activeElement?.id).toBe("c1");

    // The parent closes while the child is still on screen: focus must stay in
    // the child, not jump to the element that opened the parent.
    outer.deactivate();
    expect(document.activeElement?.id).toBe("c1");
    // And the child is still the trap handling keys: Tab wraps at its edge.
    document.getElementById("c2")?.focus();
    tab();
    expect(document.activeElement?.id).toBe("c1");

    // Closing the child returns focus to where it was before the child opened,
    // which is the parent's control — not all the way back to the page.
    inner.deactivate();
    expect(document.activeElement?.id).toBe("p1");
    parent.remove();
    child.remove();
    opener.remove();
  });

  it("skips disabled, fieldset-disabled and hidden controls", () => {
    const host = document.createElement("div");
    host.setAttribute("tabindex", "-1");
    host.innerHTML =
      '<fieldset disabled><input id="off" /></fieldset>' +
      '<div hidden><button id="gone">gone</button></div>' +
      '<button id="only">only</button>';
    document.body.append(host);
    const trap = createFocusTrap(host);
    trap.activate();
    expect(document.activeElement?.id).toBe("only");
    tab();
    expect(document.activeElement?.id).toBe("only");
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
