// @vitest-environment node
import type { StagedAssetMeta } from "@myz/core/staged-asset";
import { RECORD_KINDS } from "@myz/shared/types";
import { describe, expect, it } from "vitest";
import {
  buildAssetRecords,
  firstAttachment,
  sharedContext,
  videoDeepLink,
  videoTimeLabel,
} from "@/dashboard/pages/assets/asset-records";

function asset(
  id: string,
  overrides: Partial<StagedAssetMeta> = {},
): StagedAssetMeta {
  return {
    id,
    name: `asset ${id}`,
    mime: "image/png",
    width: 1280,
    height: 720,
    thumb: "data:image/png;base64,xxx",
    sourceKind: "image",
    createdAt: "2026-01-01T00:00:00.000Z",
    size: 1024,
    ...overrides,
  } as StagedAssetMeta;
}

describe("buildAssetRecords", () => {
  it("turns one capture into one clip record with an attachment", () => {
    const [payload] = buildAssetRecords([
      asset("a", {
        context: {
          pageUrl: "https://example.com/post/1",
          pageTitle: "A post",
          text: "the selected line",
        },
      }),
    ]);

    expect(payload.kind).toBe(RECORD_KINDS.CLIP);
    expect(payload.text).toBe("the selected line");
    expect(payload.url).toBe("https://example.com/post/1");
    expect(payload.sourceUrl).toBe("https://example.com/post/1");
    expect(payload.title).toBe("A post");
    expect(payload.hostname).toBe("example.com");
    expect(payload.attachments).toEqual([
      { assetId: "a", mime: "image/png", width: 1280, height: 720 },
    ]);
  });

  it("falls back to the name and a local url when there is no page", () => {
    const [payload] = buildAssetRecords([asset("b")]);
    expect(payload.text).toBe("asset b");
    expect(payload.url).toBe("myz-asset:b");
    expect(payload.sourceUrl).toBeUndefined();
    expect(payload.hostname).toBeUndefined();
  });

  it("keeps the shared part of a batch and leaves the rest empty", () => {
    const batch = [
      asset("c1", {
        context: {
          pageUrl: "https://example.com/gallery",
          pageTitle: "Gallery",
        },
      }),
      asset("c2", {
        context: {
          pageUrl: "https://example.com/gallery",
          pageTitle: "Gallery",
        },
      }),
    ];

    expect(sharedContext(batch)).toEqual({
      pageUrl: "https://example.com/gallery",
      pageTitle: "Gallery",
      text: undefined,
    });

    const payloads = buildAssetRecords(batch);
    expect(payloads).toHaveLength(2);
    expect(
      payloads.every((entry) => entry.url === "https://example.com/gallery"),
    ).toBe(true);
    // Per-capture text is not borrowed across the batch.
    expect(payloads.map((entry) => entry.text)).toEqual([
      "asset c1",
      "asset c2",
    ]);
  });

  it("leaves the shared fields empty when captures disagree", () => {
    const batch = [
      asset("d1", {
        context: { pageUrl: "https://example.com/one", pageTitle: "One" },
      }),
      asset("d2", {
        context: { pageUrl: "https://example.com/two", pageTitle: "Two" },
      }),
    ];

    expect(sharedContext(batch)).toEqual({
      pageUrl: undefined,
      pageTitle: undefined,
      text: undefined,
    });

    const payloads = buildAssetRecords(batch);
    // Each record still points at its own page rather than a wrong shared one.
    expect(payloads[0].url).toBe("https://example.com/one");
    expect(payloads[1].url).toBe("https://example.com/two");
    expect(payloads[0].title).toBe("asset d1");
  });

  it("returns nothing for an empty batch", () => {
    expect(buildAssetRecords([])).toEqual([]);
  });

  it("exposes only the first attachment to the card", () => {
    const [payload] = buildAssetRecords([asset("e")]);
    expect(firstAttachment(payload)?.assetId).toBe("e");
    expect(firstAttachment({ attachments: [] })).toBeUndefined();
  });
});

describe("video time context", () => {
  it("formats mm:ss and builds a deep link on the frame", () => {
    const frame = asset("f", {
      sourceKind: "video-frame",
      context: { pageUrl: "https://video.example/watch?v=1", timeSeconds: 83 },
    });

    expect(videoTimeLabel(frame)).toBe("1:23");
    expect(videoDeepLink(frame)).toBe("https://video.example/watch?v=1&t=83s");
  });

  it("says nothing when the capture has no time", () => {
    expect(videoTimeLabel(asset("g"))).toBe("");
    expect(videoDeepLink(asset("g"))).toBeUndefined();
  });
});
