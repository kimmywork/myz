import { describe, expect, it } from "vitest";
import {
  canonicalSnapshotUrl,
  groupByCanonicalUrl,
  groupVersions,
  isNoiseParameter,
} from "../src/snapshot-versions";

describe("canonicalSnapshotUrl", () => {
  it("drops the fragment and known tracking parameters", () => {
    expect(
      canonicalSnapshotUrl(
        "https://example.com/post?utm_source=x&fbclid=abc&id=7#section-2",
      ),
    ).toBe("https://example.com/post?id=7");
  });

  it("treats a fragment as the same page", () => {
    expect(canonicalSnapshotUrl("https://example.com/a#one")).toBe(
      canonicalSnapshotUrl("https://example.com/a#two"),
    );
  });

  it("treats a video timestamp as the same page", () => {
    expect(canonicalSnapshotUrl("https://example.com/watch?v=1&t=83s")).toBe(
      "https://example.com/watch?v=1",
    );
    expect(canonicalSnapshotUrl("https://example.com/watch?v=1&t=1m23s")).toBe(
      "https://example.com/watch?v=1",
    );
  });

  it("keeps a t= that is not a playback position", () => {
    // Some sites use `t` for content; dropping it would merge two pages.
    expect(canonicalSnapshotUrl("https://example.com/p?t=chapter-2")).toBe(
      "https://example.com/p?t=chapter-2",
    );
  });

  it("keeps source/start, which can identify content", () => {
    expect(canonicalSnapshotUrl("https://example.com/p?source=docs&start=40")).toBe(
      "https://example.com/p?source=docs&start=40",
    );
  });

  it("keeps content parameters it does not recognize", () => {
    // Guessing here would merge two different bodies into one page's versions.
    expect(canonicalSnapshotUrl("https://example.com/p?id=7&page=2")).toBe(
      "https://example.com/p?id=7&page=2",
    );
    expect(
      canonicalSnapshotUrl("https://example.com/p?utm_source=x&p=42"),
    ).toBe("https://example.com/p?p=42");
  });

  it("sorting removes parameter-order differences", () => {
    expect(canonicalSnapshotUrl("https://example.com/p?b=2&a=1")).toBe(
      canonicalSnapshotUrl("https://example.com/p?a=1&b=2"),
    );
  });

  it("keeps different paths apart", () => {
    expect(canonicalSnapshotUrl("https://example.com/a")).not.toBe(
      canonicalSnapshotUrl("https://example.com/b"),
    );
  });

  it("returns an unparseable url unchanged instead of grouping it", () => {
    expect(canonicalSnapshotUrl("not a url")).toBe("not a url");
    expect(canonicalSnapshotUrl("")).toBe("");
  });

  it("classifies parameters", () => {
    expect(isNoiseParameter("utm_whatever")).toBe(true);
    expect(isNoiseParameter("FBCLID")).toBe(true);
    expect(isNoiseParameter("t", "83s")).toBe(true);
    expect(isNoiseParameter("t", "chapter-2")).toBe(false);
    expect(isNoiseParameter("source")).toBe(false);
    expect(isNoiseParameter("id")).toBe(false);
    expect(isNoiseParameter("page")).toBe(false);
  });
});

describe("version grouping", () => {
  const snapshot = (id: string, url: string, createdAt: string) => ({
    id,
    url,
    createdAt,
  });

  it("puts the newest version first and points at it", () => {
    const result = groupVersions([
      snapshot("old", "https://example.com/a", "2026-01-01T00:00:00.000Z"),
      snapshot("new", "https://example.com/a", "2026-02-01T00:00:00.000Z"),
    ]);
    expect(result.versions.map((entry) => entry.id)).toEqual(["new", "old"]);
    expect(result.newestIndex).toBe(0);
  });

  it("groups tracking variants as one page", () => {
    const groups = groupByCanonicalUrl([
      snapshot("a", "https://example.com/post?utm_source=x", "2026-01-01T00:00:00.000Z"),
      snapshot("b", "https://example.com/post?fbclid=y", "2026-02-01T00:00:00.000Z"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].versions.map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("keeps different content parameters as separate pages", () => {
    const groups = groupByCanonicalUrl([
      snapshot("a", "https://example.com/p?id=1", "2026-01-01T00:00:00.000Z"),
      snapshot("b", "https://example.com/p?id=2", "2026-02-01T00:00:00.000Z"),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("orders groups by their newest member", () => {
    const groups = groupByCanonicalUrl([
      snapshot("old-page", "https://example.com/a", "2026-01-01T00:00:00.000Z"),
      snapshot("new-page", "https://example.com/b", "2026-03-01T00:00:00.000Z"),
    ]);
    expect(groups[0].versions[0].id).toBe("new-page");
  });

  it("handles an empty list", () => {
    expect(groupVersions([]).newestIndex).toBe(-1);
    expect(groupByCanonicalUrl([])).toEqual([]);
  });
});
