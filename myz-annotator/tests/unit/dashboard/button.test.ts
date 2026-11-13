import { describe, expect, it, vi } from "vitest";
import Button from "@myz/dashboard-ui/Button";

/**
 * A `<button>` gets real `disabled` semantics from the platform. An `<a>` does
 * not: dropping `href` only stops navigation, so the click handler still runs
 * unless the component removes it.
 */
const setup = Button.setup as unknown as (
  props: Record<string, unknown>,
  ctx: Record<string, unknown>,
) => () => { props: Record<string, unknown>; type: string };

function render(props: Record<string, unknown>) {
  return setup(
    { variant: "default", size: "md", type: "button", ...props },
    { slots: { default: () => "label" }, attrs: {} },
  )();
}

describe("Button", () => {
  it("drops the click handler on a disabled link", () => {
    const onClick = vi.fn();
    const vnode = render({ href: "/next", disabled: true, onClick });
    expect(vnode.type).toBe("a");
    expect(vnode.props.href).toBeUndefined();
    expect(vnode.props.onClick).toBeUndefined();
  });

  it("keeps the click handler on an enabled link", () => {
    const onClick = vi.fn();
    const vnode = render({ href: "/next", onClick });
    expect(vnode.props.onClick).toBe(onClick);
  });

  it("relies on the native disabled attribute for a button", () => {
    const vnode = render({ disabled: true });
    expect(vnode.type).toBe("button");
    expect(vnode.props.disabled).toBe(true);
  });
});
