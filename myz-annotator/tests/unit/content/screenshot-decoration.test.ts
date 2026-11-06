import { describe, expect, it } from "vitest";
import {
  relativeLuminance,
  resolveBackdropStyle,
} from "../../../src/content/screenshot-decoration";

describe("screenshot backdrop luminance", () => {
  it("maps sRGB extremes to WCAG relative luminance", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 128, g: 128, b: 128 })).toBeCloseTo(
      0.2159,
      3,
    );
  });

  it("lightens and lifts dark backdrops instead of darkening them", () => {
    const dark = resolveBackdropStyle(0);
    expect(dark.brightness).toBeCloseTo(1, 3);
    expect(dark.lift).toBeCloseTo(0.12, 3);
  });

  it("keeps the gentle dim for light backdrops", () => {
    const light = resolveBackdropStyle(1);
    expect(light.brightness).toBeCloseTo(0.9, 3);
    expect(light.lift).toBe(0);
  });

  it("transitions monotonically between dark and light", () => {
    const samples = [0, 0.1, 0.2, 0.3, 0.45, 0.7, 1].map(resolveBackdropStyle);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i].brightness).toBeLessThanOrEqual(
        samples[i - 1].brightness,
      );
      expect(samples[i].lift).toBeLessThanOrEqual(samples[i - 1].lift);
    }
  });
});
