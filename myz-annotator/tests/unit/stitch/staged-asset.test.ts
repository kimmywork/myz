import { describe, expect, it } from "vitest";
import {
  estimateDataUrlBytes,
  formatAssetSize,
  normalizeStagedAsset,
  toStagedAssetMeta,
} from "@/stitch/staged-asset";

describe("normalizeStagedAsset", () => {
  it("rejects records without an id or payload", () => {
    expect(normalizeStagedAsset(null)).toBeNull();
    expect(normalizeStagedAsset({})).toBeNull();
    expect(normalizeStagedAsset({ id: "a" })).toBeNull();
    expect(
      normalizeStagedAsset({ dataUrl: "data:image/png;base64,AA" }),
    ).toBeNull();
  });

  it("fills safe defaults for missing fields", () => {
    const asset = normalizeStagedAsset({
      id: "asset-1",
      dataUrl: "data:image/png;base64,AAAA",
    });
    expect(asset).not.toBeNull();
    expect(asset?.name).toBe("未命名图片");
    expect(asset?.mime).toBe("image/png");
    expect(asset?.sourceKind).toBe("image");
    expect(asset?.thumb).toBe("data:image/png;base64,AAAA");
    expect(asset?.width).toBe(0);
    expect(asset?.createdAt).toBeTruthy();
  });

  it("keeps valid values and coerces dimensions", () => {
    const asset = normalizeStagedAsset({
      id: "asset-2",
      dataUrl: "data:image/webp;base64,AAAA",
      thumb: "data:image/webp;base64,BB",
      name: "帧 1",
      mime: "image/webp",
      width: 1280.6,
      height: 720.2,
      sourceKind: "video-frame",
      sourceUrl: "https://example.com/v",
      size: 100,
    });
    expect(asset?.width).toBe(1281);
    expect(asset?.height).toBe(720);
    expect(asset?.sourceKind).toBe("video-frame");
    expect(asset?.sourceUrl).toBe("https://example.com/v");
  });

  it("falls back to `image` for an unknown kind", () => {
    const asset = normalizeStagedAsset({
      id: "asset-3",
      dataUrl: "data:image/png;base64,AAAA",
      sourceKind: "bogus",
    });
    expect(asset?.sourceKind).toBe("image");
  });
});

describe("toStagedAssetMeta", () => {
  it("drops the heavy dataUrl", () => {
    const meta = toStagedAssetMeta({
      id: "a",
      name: "n",
      mime: "image/png",
      width: 1,
      height: 1,
      dataUrl: "data:image/png;base64,AAAA",
      thumb: "data:image/png;base64,BB",
      sourceKind: "image",
      createdAt: "2026-01-01T00:00:00.000Z",
      size: 3,
    });
    expect(meta).not.toHaveProperty("dataUrl");
    expect(meta.thumb).toBe("data:image/png;base64,BB");
  });
});

describe("estimateDataUrlBytes", () => {
  it("estimates the decoded length of a base64 payload", () => {
    // 8 base64 chars with no padding => 6 bytes.
    expect(estimateDataUrlBytes("data:image/png;base64,AAAAAAAA")).toBe(6);
    // With padding.
    expect(estimateDataUrlBytes("data:image/png;base64,AAA=")).toBe(2);
    expect(estimateDataUrlBytes("data:image/png;base64,AA==")).toBe(1);
  });

  it("returns 0 for non-data input", () => {
    expect(estimateDataUrlBytes("nope")).toBe(0);
  });
});

describe("formatAssetSize", () => {
  it("formats byte counts", () => {
    expect(formatAssetSize(0)).toBe("—");
    expect(formatAssetSize(512)).toBe("512 B");
    expect(formatAssetSize(2048)).toBe("2 KB");
    expect(formatAssetSize(1024 * 1024 * 1.5)).toBe("1.5 MB");
  });
});
