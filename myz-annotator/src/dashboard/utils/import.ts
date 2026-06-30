import { z } from "zod";
import { normalizeRecord, parseTags } from "./records";
import { type MyZRecord, RECORD_KINDS } from "@/shared/types.ts";

const IMPORTED_TAG = "imported";

export type ImportFileFormat =
  "json" | "raindrop" | "chrome-bookmarks" | "weava";

export type ImportSource =
  "auto" | "myz-json" | "raindrop-csv" | "chrome-bookmarks" | "weava-csv";

const ImportStructureSchema = z.union([
  z.array(z.unknown()),
  z
    .object({ highlights: z.array(z.unknown()) })
    .transform((data) => data.highlights),
  z.object({ data: z.array(z.unknown()) }).transform((data) => data.data),
]);

export function normalizeImportedPayload(
  payload:
    MyZRecord[] | { highlights?: MyZRecord[]; data?: MyZRecord[] } | unknown,
): MyZRecord[] {
  const result = ImportStructureSchema.safeParse(payload);

  if (!result.success) {
    return [];
  }

  const rawItems = result.data;

  return rawItems
    .map((item) => normalizeRecord(item))
    .filter((item): item is MyZRecord => item !== null);
}

export function appendImportedTag(records: MyZRecord[]): MyZRecord[] {
  return records.map((record) => {
    const rawTags = Array.isArray(record.tags) ? record.tags : [];
    const cleaned = rawTags
      .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
      .filter(Boolean);
    const hasImported = cleaned.some(
      (tag) => tag.toLowerCase() === IMPORTED_TAG,
    );
    const tags = hasImported ? cleaned : [...cleaned, IMPORTED_TAG];
    return { ...record, tags };
  });
}

export function parseImportFile(
  file: File | undefined,
  text: string,
  source: ImportSource = "auto",
): { format: ImportFileFormat; records: MyZRecord[] } {
  const format = resolveImportFileFormat(file, text, source);
  if (!format) {
    throw new Error("无法识别导入文件格式");
  }

  if (format === "json") {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("JSON 格式无效");
    }
    return { format, records: normalizeImportedPayload(parsed) };
  }

  if (format === "raindrop") {
    return { format, records: parseRaindropCsv(text) };
  }

  if (format === "weava") {
    return { format, records: parseWeavaCsv(text) };
  }

  return { format, records: parseChromeBookmarksHtml(text) };
}

function resolveImportFileFormat(
  file: File | undefined,
  text: string,
  source: ImportSource,
): ImportFileFormat | null {
  if (source !== "auto") {
    if (source === "myz-json") return "json";
    if (source === "raindrop-csv") return "raindrop";
    if (source === "weava-csv") return "weava";
    return "chrome-bookmarks";
  }

  const name = file?.name?.toLowerCase() || "";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".html") || name.endsWith(".htm")) {
    return "chrome-bookmarks";
  }

  const type = file?.type?.toLowerCase() || "";
  if (type.includes("json")) return "json";
  if (type.includes("html")) return "chrome-bookmarks";

  const isCsv = name.endsWith(".csv") || type.includes("csv");

  const trimmed = text.trimStart();
  if (trimmed.startsWith("<!DOCTYPE NETSCAPE-Bookmark-file-1")) {
    return "chrome-bookmarks";
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "json";
  }

  const headerLine = trimmed.split(/\r?\n/, 1)[0]?.toLowerCase() || "";
  if (isCsv || headerLine.includes("url")) {
    if (
      headerLine.includes("website title") ||
      headerLine.includes("highlighted text")
    ) {
      return "weava";
    }
    if (headerLine.includes("url") && headerLine.includes("created")) {
      return "raindrop";
    }
    if (isCsv) {
      return "raindrop";
    }
  }

  return null;
}

function parseCsvRows(text: string): string[][] {
  if (!text) {
    return [];
  }
  let normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.charCodeAt(0) === 0xfeff) {
    normalized = normalized.slice(1);
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        field += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" && !inQuotes) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  row.push(field);
  rows.push(row);

  while (
    rows.length &&
    rows[rows.length - 1].length === 1 &&
    !rows[rows.length - 1][0].trim()
  ) {
    rows.pop();
  }

  return rows;
}

function parseRaindropCsv(text: string): MyZRecord[] {
  const rows = parseCsvRows(text);
  if (!rows.length) {
    return [];
  }

  const header = rows.shift() || [];
  const headerMap = new Map(
    header.map((item, index) => [item.trim().toLowerCase(), index]),
  );

  const urlIndex = headerMap.get("url");
  if (urlIndex === undefined) {
    throw new Error("CSV 缺少 url 列");
  }

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
    if (!url) {
      return;
    }
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

    const bookmark = {
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
    };
    records.push(bookmark);

    const highlightText =
      highlightsIndex !== undefined ? row[highlightsIndex] || "" : "";
    const clips = parseRaindropHighlights(highlightText);
    clips.forEach((clipText) => {
      if (!clipText) {
        return;
      }
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

function parseWeavaCsv(text: string): MyZRecord[] {
  const rows = parseCsvRows(text);
  if (!rows.length) {
    return [];
  }

  const header = rows.shift() || [];
  const headerMap = new Map(
    header.map((item, index) => [item.trim().toLowerCase(), index]),
  );

  const urlIndex = headerMap.get("url");
  if (urlIndex === undefined) {
    throw new Error("CSV 缺少 URL 列");
  }

  const dateIndex = headerMap.get("date");
  const titleIndex = headerMap.get("website title");
  const textIndex = headerMap.get("highlighted text/image url");
  const noteIndex = headerMap.get("note");

  const nowIso = new Date().toISOString();
  const records: Array<Partial<MyZRecord>> = [];

  rows.forEach((row) => {
    const url = (row[urlIndex] || "").trim();
    if (!url) {
      return;
    }
    const text = textIndex !== undefined ? (row[textIndex] || "").trim() : "";
    if (!text) {
      return;
    }
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

function parseRaindropHighlights(value: string): string[] {
  if (!value) {
    return [];
  }
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

function parseChromeBookmarksHtml(text: string): MyZRecord[] {
  if (typeof DOMParser === "undefined") {
    throw new Error("当前环境无法解析 HTML 书签");
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");
  const anchors = Array.from(doc.querySelectorAll("a[href]"));
  if (!anchors.length) {
    return [];
  }

  const nowIso = new Date().toISOString();
  return anchors
    .map((anchor) => {
      const url = anchor.getAttribute("href")?.trim() || "";
      if (!url) {
        return null;
      }
      const title = (anchor.textContent || "").trim();
      const addDate =
        anchor.getAttribute("add_date") || anchor.getAttribute("ADD_DATE");
      const createdAt = normalizeTimestamp(addDate || "", nowIso);
      const record = {
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
      return record;
    })
    .filter((record): record is NonNullable<typeof record> => record !== null)
    .map((record) => normalizeRecord(record))
    .filter((record): record is MyZRecord => record !== null);
}

function normalizeTimestamp(value: string, fallback: string): string {
  if (!value) {
    return fallback;
  }
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      const ms = trimmed.length <= 10 ? numeric * 1000 : numeric;
      return new Date(ms).toISOString();
    }
  }
  const parsed = Date.parse(trimmed);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return new Date(parsed).toISOString();
}
