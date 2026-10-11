import { RECORD_KINDS, type MyZRecord } from "@myz/shared/types";
import { normalizeRecord, parseTags } from "../records.js";
import { normalizeTimestamp, parseCsvRows } from "./csv.js";

export function parseRaindropHighlights(value: string): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.startsWith("Highlight:")
        ? line.slice("Highlight:".length).trim()
        : line,
    )
    .filter(Boolean);
}

export function parseRaindropCsv(text: string): MyZRecord[] {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];

  const header = rows.shift() || [];
  const headerMap = new Map(
    header.map((item, index) => [item.trim().toLowerCase(), index]),
  );

  const urlIndex = headerMap.get("url");
  if (urlIndex === undefined) throw new Error("CSV 缺少 url 列");

  const titleIndex = headerMap.get("title");
  const excerptIndex = headerMap.get("excerpt");
  const noteIndex = headerMap.get("note");
  const tagsIndex = headerMap.get("tags");
  const createdIndex = headerMap.get("created");
  const highlightsIndex = headerMap.get("highlights");

  const nowIso = new Date().toISOString();
  const records: Array<Partial<MyZRecord>> = [];

  rows.forEach((row) => {
    const url = (row[urlIndex] || "").trim();
    if (!url) return;
    const title =
      titleIndex !== undefined ? (row[titleIndex] || "").trim() : "";
    const text =
      excerptIndex !== undefined ? (row[excerptIndex] || "").trim() : "";
    const note = noteIndex !== undefined ? (row[noteIndex] || "").trim() : "";
    const createdRaw =
      createdIndex !== undefined ? (row[createdIndex] || "").trim() : "";
    const createdAt = normalizeTimestamp(createdRaw, nowIso);
    const tagsRaw =
      tagsIndex !== undefined ? (row[tagsIndex] || "").trim() : "";
    const tags = parseTags(tagsRaw);

    records.push({
      id: "",
      kind: RECORD_KINDS.BOOKMARK,
      url,
      sourceUrl: url,
      title: title || undefined,
      text,
      html: "",
      note,
      tags: tags.length ? tags : undefined,
      createdAt,
      updatedAt: createdAt,
    });

    const highlightText =
      highlightsIndex !== undefined ? row[highlightsIndex] || "" : "";
    parseRaindropHighlights(highlightText).forEach((clipText) => {
      if (!clipText) return;
      records.push({
        id: "",
        kind: RECORD_KINDS.CLIP,
        url,
        sourceUrl: url,
        title: title || undefined,
        text: clipText,
        html: "",
        note: "",
        tags: tags.length ? tags : undefined,
        createdAt,
        updatedAt: createdAt,
      });
    });
  });

  return records
    .map((record) => normalizeRecord(record))
    .filter((record): record is MyZRecord => record !== null);
}
