import { type MyZRecord } from "@myz/shared/types";
import { z } from "zod";
import { parseChromeBookmarksHtml } from "./import/bookmarks.js";
import {
  resolveImportFileFormat,
  type ImportFileFormat,
  type ImportSource,
} from "./import/formats.js";
import { parseRaindropCsv } from "./import/raindrop.js";
import { parseWeavaCsv } from "./import/weava.js";
import { normalizeRecord } from "./records";

export type { ImportFileFormat, ImportSource } from "./import/formats.js";

const IMPORTED_TAG = "imported";

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
  if (!result.success) return [];
  return result.data
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
  if (!format) throw new Error("无法识别导入文件格式");

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
