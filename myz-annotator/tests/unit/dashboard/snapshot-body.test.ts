// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  highlightSnapshotText,
  renderSnapshotBody,
} from "@/dashboard/pages/highlight-viewer/snapshot-body";

describe("renderSnapshotBody", () => {
  it("strips anything unsafe before rendering", () => {
    const html = `<p onclick="steal()">text</p><script>alert(1)</script>
      <a href="javascript:evil()">link</a>`;
    const rendered = renderSnapshotBody({ html }, undefined);

    expect(rendered).not.toContain("<script");
    expect(rendered).not.toContain("onclick");
    expect(rendered).not.toContain("javascript:");
    expect(rendered).toContain("text");
  });

  it("marks the record's text inside the body", () => {
    const html = `<p>before</p><p>the selected sentence</p><p>after</p>`;
    const rendered = renderSnapshotBody({ html }, "the selected sentence");

    expect(rendered).toContain("<mark");
    expect(rendered).toContain("the selected sentence");
  });

  it("matches across the snapshot's own spacing", () => {
    // The page has two spaces and a newline; the record stores one space.
    const html = `<p>the  selected\nsentence</p>`;
    const rendered = highlightSnapshotText(html, "the selected sentence");
    expect(rendered).toContain("<mark");
    expect(rendered).toContain("the  selected\nsentence");
  });

  it("leaves the body alone when the text is not found", () => {
    const html = `<p>something else</p>`;
    const rendered = renderSnapshotBody({ html }, "not present here");
    expect(rendered).not.toContain("<mark");
    expect(rendered).toContain("something else");
  });

  it("ignores an empty record text", () => {
    const html = `<p>body</p>`;
    expect(renderSnapshotBody({ html }, "")).toContain("body");
  });
});
