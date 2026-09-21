import { describe, expect, it } from "vitest";
import type { EpubTocEntry } from "@/epub/parse.js";
import { filterToc, findTocPath } from "@/epub/toc.js";

function entry(
  label: string,
  href: string,
  children: EpubTocEntry[] = [],
  depth = 0,
): EpubTocEntry {
  return { label, href, depth, children };
}

describe("findTocPath", () => {
  const toc = [
    entry("One", "ch1.xhtml", [
      entry("Section 1.1", "ch1.xhtml#s1", [], 1),
      entry("Section 1.2", "ch1.xhtml#s2", [], 1),
    ]),
    entry("Two", "ch2.xhtml"),
  ];

  it("returns the ancestor chain including the target", () => {
    expect(findTocPath(toc, "ch1.xhtml#s1")).toEqual([
      "ch1.xhtml",
      "ch1.xhtml#s1",
    ]);
  });

  it("returns a single-element path for a top-level entry", () => {
    expect(findTocPath(toc, "ch2.xhtml")).toEqual(["ch2.xhtml"]);
  });

  it("returns null when the href is absent", () => {
    expect(findTocPath(toc, "missing.xhtml")).toBeNull();
  });
});

describe("filterToc", () => {
  const toc = [
    entry("Chapter One", "ch1.xhtml", [
      entry("Alpha", "ch1.xhtml#a", [], 1),
      entry("Beta", "ch1.xhtml#b", [], 1),
    ]),
    entry("Chapter Two", "ch2.xhtml"),
  ];

  it("keeps a parent when a descendant matches", () => {
    const result = filterToc(toc, "alpha");
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Chapter One");
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].label).toBe("Alpha");
  });

  it("matches on href as well as label", () => {
    const result = filterToc(toc, "ch2");
    expect(result.map((item) => item.label)).toEqual(["Chapter Two"]);
  });

  it("returns nothing when no entry matches", () => {
    expect(filterToc(toc, "zzz")).toEqual([]);
  });
});
