import { z } from "zod";
import { HighlightStyleSchema, SerializedRangeSchema } from "./schemas/common";
import { MyZRecordSchema } from "./schemas/records";

export { HighlightStyleSchema, SerializedRangeSchema, MyZRecordSchema };

export const ImportStrategySchema = z.preprocess(
  (val) => {
    const s = typeof val === "string" ? val.toLowerCase() : "";
    if (s === "overwrite") return "overwrite";
    if (s === "latest" || s === "keep-latest") return "latest";
    return "skip";
  },
  z.enum(["overwrite", "latest", "skip"]),
);

export const SanitizedUrlSchema = z.preprocess((val) => {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (!/^https?:$/i.test(url.protocol)) return undefined;
    return url.toString();
  } catch {
    return trimmed.startsWith("http") ? trimmed : undefined;
  }
}, z.string().optional());

export const SanitizedColorSchema = z.preprocess((val) => {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : undefined;
}, z.string().optional());

export const SanitizedTimestampSchema = z.preprocess((val) => {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) return undefined;
  return new Date(timestamp).toISOString();
}, z.string().optional());

export const SanitizedTagsSchema = z.preprocess((val) => {
  if (!Array.isArray(val)) return undefined;
  const normalized = val
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}, z.array(z.string()).optional());
