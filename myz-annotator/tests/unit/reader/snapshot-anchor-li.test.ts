import type { RecordsStore } from "@myz/core/ports";
import { createRecord } from "@myz/core/services/records";
import { recordAnchorText } from "@myz/shared/recordDisplay";
import { RECORD_KINDS } from "@myz/shared/types";
import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "@/content/utils/htmlToMarkdown";
import {
  resolveRecordAnchor,
  resolveSnapshotAnchor,
} from "@/dashboard/pages/highlight-viewer/snapshot-anchor";
import { snapshotTextOf } from "@/dashboard/pages/highlight-viewer/snapshot-body";

const html =
  "<ul><li>与轮询相比，<code>clipboardchange</code> 事件具有多项优势：</li>" +
  "<li><strong>高效</strong>：仅在实际发生变化时触发事件。</li>" +
  // The real page has no space before the inline <a>; Defuddle adds one.
  '<li><strong>保护隐私</strong>：该事件仅公开<a href="https://www.w3.org/TR/clipboard-apis/#mandatory-data-types-x">原生 MIME 类型</a>，而不公开实际内容。</li></ul>';

// Exactly what Defuddle emits for the selection above (2026-11-27 bug):
// spaces creep in around `code` / `strong` / links and before punctuation.
const markdown =
  "- 与轮询相比， `clipboardchange` 事件具有多项优势：\n" +
  "- **高效** ：仅在实际发生变化时触发事件。\n" +
  "- **保护隐私** ：该事件仅公开 [原生 MIME 类型](https://www.w3.org/TR/clipboard-apis/#mandatory-data-types-x) ，而不公开实际内容。";

const store: RecordsStore = {
  get: async () => null,
  getByUrl: async () => [],
  listAll: async () => [],
  upsert: async () => {},
  remove: async () => {},
  removeMany: async () => {},
  putOpaque: async () => {},
  listOpaque: async () => [],
  deleteOpaque: async () => {},
};

describe("snapshot anchoring of list-item captures", () => {
  const haystack = snapshotTextOf(html);

  it("locates a legacy Markdown record with li items", () => {
    const anchor = resolveSnapshotAnchor(
      recordAnchorText({ text: markdown }),
      haystack,
    );
    expect(anchor.status).toBe("located");
    expect(anchor.matches).toBe(1);
  });

  it("falls back to Markdown when an older anchorText has inline spaces", () => {
    // Records saved by the previous build stored "<code>x</code>" as " x ".
    const staleAnchor = recordAnchorText({ text: markdown }).replace(
      "，clipboardchange",
      "， clipboardchange",
    );
    const result = resolveRecordAnchor(
      { text: markdown, anchorText: staleAnchor },
      haystack,
    );
    expect(result.anchor.status).toBe("located");
  });

  it("stores a plain anchor matching the snapshot's li separators", async () => {
    // htmlToMarkdown is injected, so this is exactly the save path.
    expect(htmlToMarkdown(html)).toBeTruthy();
    const record = await createRecord(
      store,
      {
        html,
        text: markdown,
        kind: RECORD_KINDS.HIGHLIGHT,
        url: "https://example.com",
      },
      { htmlToMarkdown: async () => markdown },
    );
    expect(record.anchorText).toBeTruthy();
    expect(
      resolveSnapshotAnchor(record.anchorText || "", haystack).status,
    ).toBe("located");
  });
});
