// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  snapshotDateLabel,
  snapshotHeaderLine,
  SNAPSHOT_MAX_BYTES,
  SNAPSHOT_QUOTA_BYTES,
  formatSnapshotUsage,
  planEviction,
  snapshotStatusLine,
  usedBytes,
} from "../src/page-snapshot";

function entry(id: string, bytes: number, usedAt: string) {
  return {
    id,
    url: `https://example.com/${id}`,
    title: id,
    bytes,
    createdAt: usedAt,
    usedAt,
  };
}

describe("planEviction", () => {
  it("keeps everything when there is room", () => {
    const plan = planEviction([entry("a", 100, "1")], 100, 1000);
    expect(plan).toEqual({ evict: [], fits: true });
  });

  it("evicts least recently used first, and only as much as needed", () => {
    const existing = [
      entry("new", 300, "2026-01-03"),
      entry("old", 300, "2026-01-01"),
      entry("mid", 300, "2026-01-02"),
    ];
    // 900 used + 200 incoming over a 1000 quota: 100 must go — the oldest one.
    const plan = planEviction(existing, 200, 1000);
    expect(plan.evict).toEqual(["old"]);
    expect(plan.fits).toBe(true);
  });

  it("evicts several when one is not enough", () => {
    const existing = [
      entry("old", 400, "2026-01-01"),
      entry("mid", 400, "2026-01-02"),
      entry("new", 400, "2026-01-03"),
    ];
    const plan = planEviction(existing, 300, 1000);
    // 1200 + 300 - 1000 = 500 over → two oldest.
    expect(plan.evict).toEqual(["old", "mid"]);
    expect(plan.fits).toBe(true);
  });

  it("refuses a single oversized snapshot instead of wiping the cache", () => {
    const plan = planEviction([entry("a", 10, "1")], SNAPSHOT_MAX_BYTES + 1);
    expect(plan.fits).toBe(false);
    expect(plan.evict).toEqual([]);
  });

  it("accepts a snapshot exactly at the single-snapshot cap", () => {
    const plan = planEviction([], SNAPSHOT_MAX_BYTES);
    expect(plan.fits).toBe(true);
  });

  it("reports when even evicting everything cannot make room", () => {
    // Incoming is under the per-snapshot cap but larger than this quota, so
    // the plan empties the cache and still says it does not fit.
    const plan = planEviction([entry("a", 900, "1")], 120, 100);
    expect(plan.evict).toEqual(["a"]);
    expect(plan.fits).toBe(false);
  });

  it("says it does not fit when the cache is already empty and too small", () => {
    const plan = planEviction([], 120, 100);
    expect(plan.evict).toEqual([]);
    expect(plan.fits).toBe(false);
  });
});

describe("quota constants and status line", () => {
  it("sizes the quota from the measured median", () => {
    // 80 MB / 122 KB median ≈ 670 pages; assert the order of magnitude so a
    // future edit that changes the unit or the base is caught.
    const medianBytes = 122 * 1024;
    expect(Math.round(SNAPSHOT_QUOTA_BYTES / medianBytes)).toBeGreaterThan(500);
    expect(SNAPSHOT_MAX_BYTES * 8).toBe(SNAPSHOT_QUOTA_BYTES);
  });

  it("sums the index", () => {
    expect(usedBytes([entry("a", 10, "1"), entry("b", 5, "2")])).toBe(15);
  });

  it("formats usage and the fixed status wording", () => {
    expect(formatSnapshotUsage(0)).toBe("0.0 MB");
    expect(formatSnapshotUsage(1024 * 1024 * 12.34)).toBe("12 MB");
    expect(formatSnapshotUsage(1024 * 1024 * 3.21)).toBe("3.2 MB");
    expect(snapshotStatusLine(1024 * 1024 * 5)).toBe(
      "本机快照 · 占用 5.0 MB · 空间不足时最旧的会被清理",
    );
  });

  it("formats the snapshot header with its own capture date", () => {
    const createdAt = new Date(2026, 10, 9, 14, 30).toISOString();
    expect(snapshotDateLabel(createdAt)).toBe("2026-11-09");
    expect(snapshotHeaderLine(createdAt)).toBe(
      "快照 2026-11-09 · 原页可能已更新",
    );
  });

  it("falls back to the stored date prefix when the timestamp is broken", () => {
    expect(snapshotDateLabel("2026-11-09T00:00:00.000Z")).toBe("2026-11-09");
    expect(snapshotDateLabel("broken")).toBe("broken");
  });
});
