import { describe, expect, it } from "vitest";
import {
  relativeLuminance,
  resolveCardStyle,
} from "../../../src/content/screenshot-decoration";

describe("screenshot card theme", () => {
  it("maps sRGB extremes to WCAG relative luminance", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 128, g: 128, b: 128 })).toBeCloseTo(
      0.2159,
      3,
    );
  });

  it("uses a light hairline and stronger shadow on dark pages", () => {
    const dark = resolveCardStyle(0);
    expect(dark.hairline).toContain("255, 255, 255");
    expect(dark.shadowColor).toContain("0, 0, 0, 0.55");
  });

  it("uses a dark hairline and softer shadow on light pages", () => {
    const light = resolveCardStyle(1);
    expect(light.hairline).toContain("0, 0, 0");
    expect(light.shadowColor).toContain("0, 0, 0, 0.16");
  });

  it("switches treatment around the dark luminance threshold", () => {
    expect(resolveCardStyle(0.17).hairline).toBe(resolveCardStyle(0).hairline);
    expect(resolveCardStyle(0.19).hairline).toBe(resolveCardStyle(1).hairline);
  });
});
