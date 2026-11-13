import { describe, expect, it } from "vitest";
import { resolveInitialFocus } from "@myz/dashboard-ui/Dialog";

/**
 * §4.8 landing order. The regression these pin down: `Dialog` used to pass no
 * `initialFocus`, so the trap focused "the first focusable in the DOM". With a
 * hidden X and a footer, that is the footer's submit button — Enter would then
 * accept the dialog on the user's behalf.
 */
function layer(html: string): HTMLElement {
  const host = document.createElement("div");
  host.setAttribute("role", "dialog");
  host.setAttribute("tabindex", "-1");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

const closeButton = `<header><h2>t</h2><button data-dialog-close aria-label="关闭">×</button></header>`;

describe("resolveInitialFocus", () => {
  it("prefers the first usable input over the close button", () => {
    const host = layer(
      `${closeButton}<div><input id="a" /><input id="b" /></div>`,
    );
    expect(resolveInitialFocus(host).id).toBe("a");
  });

  it("skips a disabled input and takes the next usable one", () => {
    const host = layer(
      `${closeButton}<div><input id="a" disabled /><input id="b" /></div>`,
    );
    expect(resolveInitialFocus(host).id).toBe("b");
  });

  it("skips an input hidden by an ancestor", () => {
    const host = layer(
      `${closeButton}<div hidden><input id="a" /></div><div><input id="b" /></div>`,
    );
    expect(resolveInitialFocus(host).id).toBe("b");
  });

  it("skips an input disabled by an ancestor fieldset", () => {
    const host = layer(
      `${closeButton}<fieldset disabled><input id="a" /></fieldset>` +
        `<div><input id="b" /></div>`,
    );
    expect(resolveInitialFocus(host).id).toBe("b");
  });

  it("falls back to the close button when there is no input", () => {
    const host = layer(`${closeButton}<p>body</p>`);
    expect(resolveInitialFocus(host).getAttribute("aria-label")).toBe("关闭");
  });

  it("falls back to the footer's cancel action, never the submit one", () => {
    const host = layer(
      `<div><p>body</p></div><footer data-dialog-footer>` +
        `<button class="btn btn-secondary">取消</button>` +
        `<button class="btn btn-primary">完成</button></footer>`,
    );
    expect(resolveInitialFocus(host).textContent).toBe("取消");
  });

  it("lands on the container when the footer only has a submit action", () => {
    // Designer's acceptance case: hidden X + a footer with only 「完成」.
    const host = layer(
      `<div><p>body</p></div><footer data-dialog-footer>` +
        `<button class="btn btn-primary">完成</button></footer>`,
    );
    expect(resolveInitialFocus(host)).toBe(host);
  });

  it("treats data-dialog-primary as a submit action, whatever its classes", () => {
    const host = layer(
      `<div><p>body</p></div><footer data-dialog-footer>` +
        `<button data-dialog-primary>完成</button>` +
        `<button class="btn btn-secondary">取消</button></footer>`,
    );
    expect(resolveInitialFocus(host).textContent).toBe("取消");
  });

  it("lands on the container when the only footer action is marked primary", () => {
    const host = layer(
      `<div><p>body</p></div><footer data-dialog-footer>` +
        `<button data-dialog-primary>完成</button></footer>`,
    );
    expect(resolveInitialFocus(host)).toBe(host);
  });

  it("still never lands on a submit action when the cancel is hidden", () => {
    const host = layer(
      `<div><p>body</p></div><footer data-dialog-footer>` +
        `<span hidden><button class="btn">取消</button></span>` +
        `<button class="btn btn-danger">删除</button></footer>`,
    );
    expect(resolveInitialFocus(host)).toBe(host);
  });
});
