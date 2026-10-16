import { describe, expect, it } from "vitest";
import {
  buildSimpleName,
  buildVideoName,
  formatTimestamp,
} from "@/stitch/filename";

const FIXED = new Date(2026, 9, 15, 9, 10, 0); // 2026-10-15 09:10:00 local

describe("formatTimestamp", () => {
  it("formats a compact local timestamp", () => {
    expect(formatTimestamp(FIXED)).toBe("20261015-091000");
  });
});

describe("buildSimpleName", () => {
  it("builds myz-<type>-<timestamp>", () => {
    expect(buildSimpleName("stitch", FIXED)).toBe("myz-stitch-20261015-091000");
    expect(buildSimpleName("collage", FIXED)).toBe(
      "myz-collage-20261015-091000",
    );
    expect(buildSimpleName("screenshot", FIXED)).toBe(
      "myz-screenshot-20261015-091000",
    );
  });

  it("sanitizes unsafe type characters", () => {
    expect(buildSimpleName("a b/c", FIXED)).toBe("myz-a-b-c-20261015-091000");
  });
});

describe("buildVideoName", () => {
  it("includes the host and path", () => {
    expect(buildVideoName("https://www.youtube.com/watch?v=abc", FIXED)).toBe(
      "myz-video-youtube.com-watch-20261015-091000",
    );
  });

  it("flattens nested paths (hostname excludes the port)", () => {
    expect(buildVideoName("https://example.com:8443/a/b/c.mp4", FIXED)).toBe(
      "myz-video-example.com-a-b-c.mp4-20261015-091000",
    );
  });

  it("falls back to a timestamp-only name without a URL", () => {
    expect(buildVideoName(undefined, FIXED)).toBe("myz-video-20261015-091000");
    expect(buildVideoName("blob:https://x/y", FIXED)).toBe(
      "myz-video-20261015-091000",
    );
  });
});
