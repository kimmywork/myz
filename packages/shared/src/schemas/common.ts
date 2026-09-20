import { z } from "zod"
import { HIGHLIGHT_STYLES, DEFAULT_HIGHLIGHT_STYLE } from "../enums"

const PathSegmentSchema = z.object({
  name: z.string().trim().min(1),
  index: z.coerce.number().min(0),
})

const SerializedPointSchema = z.object({
  charOffset: z.coerce.number().min(0),
  path: z.array(PathSegmentSchema).min(1),
  offset: z.coerce.number().min(0).optional(),
})

export const SerializedRangeSchema = z.object({
  start: SerializedPointSchema.optional(),
  end: SerializedPointSchema.optional(),
})

/**
 * A highlight rectangle normalized to the PDF page box.
 * `x`/`y` are the top-left corner, `width`/`height` the size,
 * all expressed as fractions in the range [0, 1] so overlays can be
 * recomputed for any render scale or zoom.
 */
export const PdfRectSchema = z.object({
  x: z.coerce.number(),
  y: z.coerce.number(),
  width: z.coerce.number(),
  height: z.coerce.number(),
})

/**
 * Locates an excerpt inside a PDF. `text` plus `occurrenceIndex` form the
 * semantic anchor (re-locatable after re-render); `rects` are only used to
 * paint the overlay.
 */
export const PdfLocatorSchema = z.object({
  pageNumber: z.coerce.number().int().min(1),
  text: z.string(),
  occurrenceIndex: z.coerce.number().int().min(0).optional(),
  rects: z.array(PdfRectSchema).optional(),
})

/**
 * Locates a spot inside an EPUB. Reflow has no page numbers, so the anchor is
 * the spine document plus a text quote; `progression` (0–1) is a coarse
 * fallback for when the quote cannot be found.
 */
export const EpubLocatorSchema = z.object({
  spineIndex: z.coerce.number().int().min(0),
  progression: z.coerce.number().min(0).max(1).optional(),
  textQuote: z.string().optional(),
  textPrefix: z.string().optional(),
  textSuffix: z.string().optional(),
})

export const HighlightStyleSchema = z.preprocess((val) => {
  if (!val) return DEFAULT_HIGHLIGHT_STYLE
  const s = String(val).toLowerCase()
  if (Object.values(HIGHLIGHT_STYLES).includes(s as HIGHLIGHT_STYLES)) {
    return s
  }
  return DEFAULT_HIGHLIGHT_STYLE
}, z.nativeEnum(HIGHLIGHT_STYLES))

export type PdfRect = z.infer<typeof PdfRectSchema>
export type PdfLocator = z.infer<typeof PdfLocatorSchema>
export type EpubLocator = z.infer<typeof EpubLocatorSchema>

