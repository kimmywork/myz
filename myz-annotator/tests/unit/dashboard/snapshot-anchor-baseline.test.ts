// @vitest-environment jsdom
import {
  deserializeRange,
  findRangeByNormalizedText,
  serializeRangePaths,
} from "@myz/shared/serializer";
import type { SerializedRange } from "@myz/shared/serializer";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeSnapshotText } from "@/content/snapshot/extract";
import { resolveSnapshotAnchor } from "@/dashboard/pages/highlight-viewer/snapshot-anchor";

/**
 * Anchor baseline (§I9): 20 records on one fixture page, measured before and
 * after a simulated page revision.
 *
 * This is the number that answers "are the anchors actually accurate?" — the
 * three-way split of path / unique-text / unlocated, plus how much of it the
 * revision destroys.
 *
 * The page is a fixture, not a live site, and the "records" are the fixture's
 * marked sentences. Nothing here is tuned to look good: the repeated phrase is
 * in the corpus on purpose, and the two deleted paragraphs are expected to
 * fail, because that is what a real revision does.
 */

const FIXTURE = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "snapshot-anchor-corpus.html",
);

function load(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** The 20 marked sentences, in document order. */
function targets(doc: Document): Array<{ name: string; text: string }> {
  return Array.from(doc.querySelectorAll("[data-target]")).map((element) => {
    const name = element.getAttribute("data-target") || "";
    // The repeated phrase is recorded as the phrase itself, the way a user
    // selecting a few words would — not as each paragraph's full sentence.
    const text =
      name === "p6" || name === "p7"
        ? "shared fragment"
        : normalizeSnapshotText(element.textContent);
    return { name, text };
  });
}

/** The text a snapshot of this page would carry, with block separators. */
function snapshotText(doc: Document): string {
  const container = doc.createElement("div");
  container.innerHTML = doc.body.innerHTML;
  container
    .querySelectorAll(
      "p, div, li, br, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th",
    )
    .forEach((element) => element.after(doc.createTextNode(" ")));
  return normalizeSnapshotText(container.textContent || "");
}

type Placement = "path" | "text" | "unlocated";

interface Row {
  name: string;
  placement: Placement;
  reason?: string;
}

/** Places each record: stored path first, then unique text. */
function placeAll(
  records: Array<{ name: string; text: string; range: SerializedRange }>,
  page: Document,
  bodyText: string,
): Row[] {
  return records.map((record) => {
    // Level 1: the stored range still resolves on the page.
    const range = deserializeRange(record.range, page);
    if (range && !range.collapsed && page.body.contains(range.startContainer)) {
      // A resolved path is not the same as a correct one: after a revision it
      // can land on different text. Record both.
      const landed = normalizeSnapshotText(range.toString());
      const correct = landed.includes(record.text.slice(0, 40));
      return {
        name: record.name,
        placement: "path",
        reason: correct ? "path-correct" : "path-wrong",
      };
    }
    // Level 2: the record's text occurs exactly once in the snapshot body.
    const anchor = resolveSnapshotAnchor(record.text, bodyText);
    return {
      name: record.name,
      placement: anchor.status === "located" ? "text" : "unlocated",
      reason: anchor.reason,
    };
  });
}

function summarize(rows: Row[]) {
  return {
    total: rows.length,
    path: rows.filter((row) => row.placement === "path").length,
    /** Paths that resolved but landed on different text. */
    pathWrong: rows.filter((row) => row.reason === "path-wrong").length,
    text: rows.filter((row) => row.placement === "text").length,
    unlocated: rows.filter((row) => row.placement === "unlocated").length,
  };
}

/** Places the same records against the snapshot body only (no paths). */
function textLevel(
  records: Array<{ name: string; text: string }>,
  bodyText: string,
) {
  const anchors = records.map((record) =>
    resolveSnapshotAnchor(record.text, bodyText),
  );
  return {
    located: anchors.filter((anchor) => anchor.status === "located").length,
    unlocated: anchors.filter((anchor) => anchor.status === "unlocated").length,
  };
}

/** A revision: move a section, delete two paragraphs, keep the rest. */
function revise(html: string): string {
  const doc = load(html);
  const article = doc.querySelector("#corpus")!;
  const appendix = doc.querySelector('h3[data-target="h3"]')!;
  const closing = doc.querySelector('p[data-target="p10"]')!;
  // Move the appendix to the front of the article.
  article.insertBefore(appendix, article.firstChild);
  article.insertBefore(closing, appendix.nextSibling);
  // Delete the two paragraphs the revision removes.
  doc.querySelector('p[data-target="p8"]')?.remove();
  doc.querySelector('p[data-target="p9"]')?.remove();
  return doc.documentElement.outerHTML;
}

describe("anchor baseline on a 20-record fixture page", () => {
  const html = fs.readFileSync(FIXTURE, "utf8");
  const original = load(html);
  const records = targets(original).map((target) => {
    // What the content script would have stored when the record was made: the
    // range comes from the block the user was in, which is why the repeated
    // phrase still has a range even though it is not unique page-wide.
    const scope =
      target.name === "p6" || target.name === "p7"
        ? (original.querySelector(`[data-target="${target.name}"]`) ??
          original.body)
        : original.body;
    const range = findRangeByNormalizedText(scope, target.text);
    const serialized = range ? serializeRangePaths(range) : null;
    if (!serialized) throw new Error(`no range for ${target.name}`);
    return { ...target, range: serialized };
  });

  it("has exactly twenty records covering the required shapes", () => {
    expect(records).toHaveLength(20);
    const names = records.map((record) => record.name);
    expect(names).toContain("h1");
    expect(names).toContain("h2");
    expect(names).toContain("li1");
    expect(names).toContain("code");
    expect(names).toContain("quote1");
  });

  it("reports the split before the page is revised", () => {
    const body = snapshotText(original);
    const rows = placeAll(records, original, body);
    const counts = summarize(rows);

    // Everything resolves by path while the page is untouched, so the useful
    // signal is the text level: the deliberately repeated phrase cannot be
    // placed uniquely.
    expect(counts.path).toBe(20);
    expect(counts.text).toBe(0);

    const textOnly = rows.filter((row) => row.placement === "path");
    expect(textOnly).toHaveLength(20);

    // Now the same 20 records against the snapshot's text alone, which is all
    // a stored copy can offer. The repeated phrase appears twice, so both of
    // its records are honest "unlocated" cases — 18 unique + 2 ambiguous.
    expect(textLevel(records, body)).toEqual({ located: 18, unlocated: 2 });

    console.log(
      "BASELINE_ORIGINAL",
      JSON.stringify({ ...counts, textLevel: textLevel(records, body) }),
    );
  });

  it("reports how much the revision destroys", () => {
    const revised = load(revise(html));
    const body = snapshotText(revised);
    const rows = placeAll(records, revised, body);
    const counts = summarize(rows);

    // The two deleted paragraphs can no longer be placed, and the repeated
    // phrase still cannot be chosen between.
    expect(textLevel(records, body)).toEqual({ located: 16, unlocated: 4 });

    // Paths do not survive the revision: the stored ranges either fail to
    // resolve or resolve into the moved block, which is exactly the situation
    // the text level exists for.
    expect(counts.path).toBeLessThan(20);

    console.log(
      "BASELINE_REVISED",
      JSON.stringify({ ...counts, textLevel: textLevel(records, body) }),
    );
  });
});
