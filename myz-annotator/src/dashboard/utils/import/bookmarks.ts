import { RECORD_KINDS, type MyZRecord } from "@myz/shared/types";
import { normalizeRecord } from "../records.js";
import { normalizeTimestamp } from "./csv.js";

/** Parse a Chrome/Netscape bookmarks HTML export into bookmark records. */
export function parseChromeBookmarksHtml(text: string): MyZRecord[] {
  if (typeof DOMParser === "undefined") {
    throw new Error("当前环境无法解析 HTML 书签");
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");
  const anchors = Array.from(doc.querySelectorAll("a[href]"));
  if (!anchors.length) return [];

  const nowIso = new Date().toISOString();
  return anchors
    .map((anchor) => {
      const url = anchor.getAttribute("href")?.trim() || "";
      if (!url) return null;
      const title = (anchor.textContent || "").trim();
      const addDate =
        anchor.getAttribute("add_date") || anchor.getAttribute("ADD_DATE");
      const createdAt = normalizeTimestamp(addDate || "", nowIso);
      return {
        id: "",
        kind: RECORD_KINDS.BOOKMARK,
        url,
        sourceUrl: url,
        title: title || undefined,
        text: "",
        html: "",
        note: "",
        createdAt,
        updatedAt: createdAt,
      };
    })
    .filter((record): record is NonNullable<typeof record> => record !== null)
    .map((record) => normalizeRecord(record))
    .filter((record): record is MyZRecord => record !== null);
}
