// @vitest-environment node
import { confirmDestructive, setConfirmHandler } from "@myz/shared/dialogs";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  setConfirmHandler(null);
  vi.unstubAllGlobals();
});

describe("confirmDestructive", () => {
  it("uses the registered themed handler and never the native dialog", async () => {
    const native = vi.fn(() => true);
    vi.stubGlobal("window", { confirm: native });
    const handler = vi.fn(async () => false);
    setConfirmHandler(handler);

    expect(await confirmDestructive("删除？")).toBe(false);
    expect(handler).toHaveBeenCalledWith({ message: "删除？" });
    expect(native).not.toHaveBeenCalled();
  });

  it("passes title and labels to the themed handler", async () => {
    const handler = vi.fn(async () => true);
    setConfirmHandler(handler);

    await confirmDestructive("删除划线？", {
      title: "删除划线？",
      confirmLabel: "删除",
    });
    expect(handler).toHaveBeenCalledWith({
      message: "删除划线？",
      title: "删除划线？",
      confirmLabel: "删除",
    });
  });

  it("falls back to the native dialog only when nothing is registered", async () => {
    const native = vi.fn(() => true);
    vi.stubGlobal("window", { confirm: native });

    expect(await confirmDestructive("删除？")).toBe(true);
    expect(native).toHaveBeenCalledWith("删除？");
  });

  it("treats a failing themed handler as a cancel", async () => {
    setConfirmHandler(async () => {
      throw new Error("host gone");
    });
    expect(await confirmDestructive("删除？")).toBe(false);
  });
});
