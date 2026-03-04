import { z } from "zod";
import { HIGHLIGHT_STYLES, DEFAULT_HIGHLIGHT_STYLE } from "../enums";

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
  if (Object.values(HIGHLIGHT_STYLES).includes(s as HIGHLIGHT_STYLES)) {
    return s;
  }
  return DEFAULT_HIGHLIGHT_STYLE;
}, z.nativeEnum(HIGHLIGHT_STYLES));
