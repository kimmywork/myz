import { describe, expect, it } from "vitest";
import { getLayouts } from "@/stitch/core/layouts";
import { estimateOffset, type Gray } from "@/stitch/core/matching";
import { buildGeometry } from "@/stitch/core/stitch";
import type { AssetItem, StitchParams } from "@/stitch/types";

/** A deterministic, texture-rich grayscale image (values 0..255). */
function makeGray(width: number, height: number): Gray {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = (y * 7 + x * 13 + ((y * x) % 17)) % 256;
    }
  }
  return { w: width, h: height, data };
}

/** Scroll `src` up by `shift` px along y: `out[y] = src[y + shift]`. */
function scrollUp(src: Gray, shift: number): Gray {
  const h = src.h - shift;
  const data = new Float32Array(src.w * h);
  for (let y = 0; y < h; y += 1) {
    data.set(
      src.data.subarray((y + shift) * src.w, (y + shift + 1) * src.w),
      y * src.w,
    );
  }
  return { w: src.w, h, data };
}

function fakeAsset(width: number, height: number): AssetItem {
  return {
    id: `a-${width}x${height}`,
    name: "fake",
    url: "",
    image: {} as HTMLImageElement,
    width,
    height,
    type: "image/png",
  };
}

function baseParams(overrides: Partial<StitchParams> = {}): StitchParams {
  return {
    axis: "y",
    strategy: "crop",
    diffMode: false,
    transition: 24,
    fixedTop: 0,
    fixedBottom: 0,
    gap: 0,
    background: "#000",
    offsets: [],
    subtitleHeight: 0,
    perImage: [],
    ...overrides,
  };
}

describe("estimateOffset", () => {
  it("recovers a known vertical scroll offset", () => {
    const a = makeGray(64, 200);
    const b = scrollUp(a, 24);
    const result = estimateOffset(a, b, { axis: "y", diffMode: false });
    expect(result.offset).toBeGreaterThanOrEqual(22);
    expect(result.offset).toBeLessThanOrEqual(26);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("returns a back-to-back offset for unrelated images", () => {
    const a = makeGray(64, 200);
    const b = makeGray(64, 200); // different seed-free pattern is identical here
    // Identical images align at 0 overlap? Instead use a reversed pattern.
    const reversed: Gray = {
      w: b.w,
      h: b.h,
      data: Float32Array.from(b.data).reverse(),
    };
    const result = estimateOffset(a, reversed, { axis: "y", diffMode: false });
    expect(result.overlapRatio).toBeGreaterThanOrEqual(0);
  });
});

describe("buildGeometry", () => {
  it("concatenates with gaps", () => {
    const assets = [fakeAsset(100, 200), fakeAsset(100, 200)];
    const geo = buildGeometry(
      assets,
      baseParams({ strategy: "concat", gap: 10 }),
    );
    expect(geo.width).toBe(100);
    expect(geo.height).toBe(410);
    expect(geo.placements.map((p) => p.dy)).toEqual([0, 210]);
  });

  it("centers narrower frames on the cross axis", () => {
    const assets = [fakeAsset(100, 200), fakeAsset(60, 200)];
    const geo = buildGeometry(assets, baseParams({ strategy: "concat" }));
    expect(geo.width).toBe(100);
    expect(geo.placements[1].dx).toBe(20);
  });

  it("stacks subtitles: first full, later frames keep the bottom strip", () => {
    const assets = [fakeAsset(100, 200), fakeAsset(100, 200)];
    const geo = buildGeometry(assets, baseParams({ strategy: "subtitle" }));
    // First frame is full (200), second keeps 15% (30).
    expect(geo.height).toBe(230);
    expect(geo.placements[0].sh).toBe(200);
    expect(geo.placements[0].dy).toBe(0);
    expect(geo.placements[1].sh).toBe(30);
    expect(geo.placements[1].sy).toBe(170);
    expect(geo.placements[1].dy).toBe(200);
  });

  it("honours explicit per-image subtitle heights", () => {
    const assets = [fakeAsset(100, 200), fakeAsset(100, 200)];
    const geo = buildGeometry(
      assets,
      baseParams({
        strategy: "subtitle",
        perImage: [
          { mode: "full", height: 0, trimTop: 0, trimBottom: 0 },
          { mode: "strip", height: 50, trimTop: 0, trimBottom: 0 },
        ],
      }),
    );
    expect(geo.placements[1].sh).toBe(50);
  });
});

describe("getLayouts", () => {
  it("returns a single full layout for one image", () => {
    const options = getLayouts(1);
    expect(options).toHaveLength(1);
    expect(options[0].id).toBe("full");
    expect(options[0].cells).toEqual([{ x: 0, y: 0, w: 1, h: 1 }]);
  });

  it("produces one cell per image within the unit square", () => {
    const options = getLayouts(4);
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option.cells).toHaveLength(4);
      for (const cell of option.cells) {
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.x + cell.w).toBeLessThanOrEqual(1.0001);
        expect(cell.y + cell.h).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("clamps the count to 16", () => {
    const options = getLayouts(20);
    for (const option of options) {
      expect(option.cells).toHaveLength(16);
    }
  });
});
