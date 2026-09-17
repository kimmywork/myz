import { beforeEach, describe, expect, it, vi } from "vitest";
import { isColorScheme, useColorScheme } from "../src/colorScheme";
import { COLOR_SCHEMES } from "../src/enums";

describe("colorScheme", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("accepts only known scheme names", () => {
    expect(isColorScheme("paper")).toBe(true);
    expect(isColorScheme("slate")).toBe(true);
    expect(isColorScheme("celadon")).toBe(true);
    expect(isColorScheme("ochre")).toBe(true);
    expect(isColorScheme("bogus")).toBe(false);
    expect(isColorScheme(undefined)).toBe(false);
    expect(isColorScheme(null)).toBe(false);
  });

  it("defaults to paper and applies data-scheme", async () => {
    const { scheme, ready } = useColorScheme();
    await vi.waitFor(() => expect(ready.value).toBe(true));
    expect(scheme.value).toBe(COLOR_SCHEMES.PAPER);
    expect(document.documentElement.dataset.scheme).toBe("paper");
  });

  it("applies a valid scheme and ignores an invalid one", async () => {
    const { scheme, ready, setScheme } = useColorScheme();
    await vi.waitFor(() => expect(ready.value).toBe(true));
    setScheme(COLOR_SCHEMES.OCHRE);
    expect(scheme.value).toBe(COLOR_SCHEMES.OCHRE);
    expect(document.documentElement.dataset.scheme).toBe("ochre");
    expect(localStorage.getItem("myz:color-scheme")).toBe("ochre");

    setScheme("bogus" as never);
    expect(scheme.value).toBe(COLOR_SCHEMES.OCHRE);
  });
});
