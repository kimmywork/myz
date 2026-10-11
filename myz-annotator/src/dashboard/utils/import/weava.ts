import { RECORD_KINDS, type MyZRecord } from "@myz/shared/types";
import { normalizeRecord } from "../records.js";
import { normalizeTimestamp, parseCsvRows } from "./csv.js";

export function parseWeavaCsv(text: string): MyZRecord[] {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];

  const header = rows.shift() || [];
  const headerMap = new Map(
    header.map((item, index) => [item.trim().toLowerCase(), index]),
  );

  const urlIndex = headerMap.get("url");
  if (urlIndex === undefined) throw new Error("CSV 缺少 URL 列");

  const dateIndex = headerMap.get("date");
  const titleIndex = headerMap.get("website title");
  const textIndex = headerMap.get("highlighted text/image url");
  const noteIndex = headerMap.get("note");

  const nowIso = new Date().toISOString();
  const records: Array<Partial<MyZRecord>> = [];

  rows.forEach((row) => {
    const url = (row[urlIndex] || "").trim();
    if (!url) return;
    const text = textIndex !== undefined ? (row[textIndex] || "").trim() : "";
    if (!text) return;
    const title =
      titleIndex !== undefined ? (row[titleIndex] || "").trim() : "";
    const note = noteIndex !== undefined ? (row[noteIndex] || "").trim() : "";
    const dateRaw =
      dateIndex !== undefined ? (row[dateIndex] || "").trim() : "";
    const createdAt = normalizeTimestamp(dateRaw, nowIso);

    records.push({
      id: "",
      kind: RECORD_KINDS.CLIP,
      url,
      sourceUrl: url,
      title: title || undefined,
      text,
      html: "",
      note,
      createdAt,
      updatedAt: createdAt,
    });
  });

  return records
    .map((record) => normalizeRecord(record))
    .filter((record): record is MyZRecord => record !== null);
}
