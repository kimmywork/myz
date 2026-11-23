// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  highlightSnapshotText,
  renderSnapshotBody,
  snapshotTextOf,
} from "@/dashboard/pages/highlight-viewer/snapshot-body";

describe("renderSnapshotBody", () => {
  it("strips anything unsafe before rendering", () => {
    const html = `<p onclick="steal()">text</p><script>alert(1)</script>
      <a href="javascript:evil()">link</a>`;
    const rendered = renderSnapshotBody({ html }, []);

    expect(rendered).not.toContain("<script");
    expect(rendered).not.toContain("onclick");
    expect(rendered).not.toContain("javascript:");
    expect(rendered).toContain("text");
  });

  it("marks every located record's text with its anchor id", () => {
    const html = `<p>before</p><p>the selected sentence</p><p>the second sentence</p>`;
    const rendered = renderSnapshotBody({ html }, [
      { id: "rec-1", text: "the selected sentence" },
      { id: "rec-2", text: "the second sentence" },
    ]);

    expect(rendered).toContain('<mark data-myz-snapshot-mark="1"');
    expect(rendered).toContain('data-myz-anchor="rec-1"');
    expect(rendered).toContain('data-myz-anchor="rec-2"');
    expect(rendered).toContain("the selected sentence");
    expect(rendered).toContain("the second sentence");
  });

  it("marks a quote that spans inline markup", () => {
    // The quote lives in three text nodes; a per-node search used to resolve
    // it as located and then silently fail to wrap anything.
    const html = `<p>alpha <em>beta</em> gamma</p>`;
    const rendered = renderSnapshotBody({ html }, [
      { id: "rec-1", text: "alpha beta gamma" },
    ]);

    expect(rendered).toContain('data-myz-anchor="rec-1"');
    // Per-text-node wrapping: one mark per spanned segment, text kept whole.
    expect(rendered.replace(/<[^>]+>/g, "")).toContain("alpha beta gamma");
  });

  it("marks a quote spanning two paragraphs", () => {
    const html = `<p>one first</p><p>second two</p>`;
    const rendered = renderSnapshotBody({ html }, [
      { id: "rec-1", text: "first second" },
    ]);

    expect(rendered.match(/data-myz-anchor="rec-1"/g)).toHaveLength(2);
    expect(rendered).toContain(">first<");
    expect(rendered).toContain(">second<");
  });

  it("matches across the snapshot's own spacing", () => {
    // The page has two spaces and a newline; the record stores one space.
    const html = `<p>the  selected\nsentence</p>`;
    const rendered = highlightSnapshotText(html, [
      { id: "rec-1", text: "the selected sentence" },
    ]);
    expect(rendered).toContain("<mark");
    expect(rendered).toContain("the  selected\nsentence");
  });

  it("leaves the body alone when the text is not found", () => {
    const html = `<p>something else</p>`;
    const rendered = renderSnapshotBody({ html }, [
      { id: "rec-1", text: "not present here" },
    ]);
    expect(rendered).not.toContain("<mark");
    expect(rendered).toContain("something else");
  });

  it("renders the plain body without marks for an empty mark list", () => {
    const html = `<p>body</p>`;
    expect(renderSnapshotBody({ html }, [])).toContain("body");
  });
});

describe("snapshotTextOf", () => {
  it("flattens blocks with separators so quotes can span them", () => {
    expect(snapshotTextOf("<p>one first</p><p>second two</p>")).toBe(
      "one first second two",
    );
  });

  it("collapses whitespace like the anchor side does", () => {
    expect(snapshotTextOf("<p>the  selected\nsentence</p>")).toBe(
      "the selected sentence",
    );
  });
});
