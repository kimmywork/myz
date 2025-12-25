import { z } from "zod";
import {
  RECORD_KINDS,
  HIGHLIGHT_STYLES,
  DEFAULT_HIGHLIGHT_STYLE,
} from "./enums";

const PathSegmentSchema = z.object({
  name: z.string().trim().min(1),
  index: z.coerce.number().min(0),
});

const SerializedPointSchema = z.object({
  charOffset: z.coerce.number().min(0),
  path: z.array(PathSegmentSchema).min(1),
  offset: z.coerce.number().min(0).optional(),
});

export const SerializedRangeSchema = z.object({
  start: SerializedPointSchema.optional(),
  end: SerializedPointSchema.optional(),
});

export const HighlightStyleSchema = z.preprocess((val) => {
  if (!val) return DEFAULT_HIGHLIGHT_STYLE;
  const s = String(val).toLowerCase();
  if (Object.values(HIGHLIGHT_STYLES).includes(s as any)) {
    return s;
  }
  return DEFAULT_HIGHLIGHT_STYLE;
}, z.nativeEnum(HIGHLIGHT_STYLES));

export const MyZRecordSchema = z.object({
  id: z.string(),
  kind: z.enum(RECORD_KINDS),
  text: z.string(),
  html: z.string().optional(),
  note: z.string().optional(),
  tags: z.array(z.string()).optional(),
  color: z.string().optional(),
  style: HighlightStyleSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  sourceUrl: z.string().optional(),
  title: z.string().optional(),
  hostname: z.string().optional(),
  range: SerializedRangeSchema.optional(),
  conversationId: z.string().optional(),
  url: z.string(),
}).loose();


export const ImportStrategySchema = z.preprocess((val) => {
  const s = typeof val === "string" ? val.toLowerCase() : "";
  if (s === "overwrite") return "overwrite";
  if (s === "latest" || s === "keep-latest") return "latest";
  return "skip";
}, z.enum(["overwrite", "latest", "skip"]));

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





