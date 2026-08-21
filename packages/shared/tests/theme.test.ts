import { describe, it, expect, vi, beforeEach } from "vitest";
import { useThemePreference } from "../src/theme";

describe("theme", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("should initialize with auto mode and dark effective theme", () => {
    const { mode, isDark } = useThemePreference();
    expect(mode.value).toBe("auto");
    expect(isDark.value).toBe(true);
  });

  it("should switch theme mode", () => {
    const { mode, setTheme } = useThemePreference();
    setTheme("light");
    expect(mode.value).toBe("light");
  });
});
