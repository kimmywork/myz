import { describe, expect, it } from "vitest"
import { EpubLocatorSchema } from "../src/schemas/common"
import { MyZRecordSchemaV1 } from "../src/schemas/records/v1"
import {
  deserializeRange,
  findRangeByNormalizedText,
  serializeRangePaths,
} from "../src/serializer"
import {
  buildEpubSourceUrl,
  epubFingerprintFromSourceUrl,
  isEpubSourceUrl,
} from "../src/url"

describe("epub source url", () => {
  it("builds and parses a synthetic source url", () => {
    const url = buildEpubSourceUrl("abc123")
    expect(url).toBe("myz-epub:abc123")
    expect(isEpubSourceUrl(url)).toBe(true)
    expect(epubFingerprintFromSourceUrl(url)).toBe("abc123")
  })

  it("does not treat pdf or web urls as epub", () => {
    expect(isEpubSourceUrl("myz-pdf:abc")).toBe(false)
    expect(isEpubSourceUrl("https://example.com/book.epub")).toBe(false)
    expect(epubFingerprintFromSourceUrl("https://example.com/book.epub")).toBe(
      null,
    )
  })
})

describe("EpubLocatorSchema", () => {
  it("accepts a minimal locator and clamps progression", () => {
    expect(EpubLocatorSchema.parse({ spineIndex: 2 })).toMatchObject({
      spineIndex: 2,
    })
    expect(() =>
      EpubLocatorSchema.parse({ spineIndex: 0, progression: 2 }),
    ).toThrow()
  })
})

describe("cross-document range anchoring (EPUB iframe)", () => {
  it("serializes and restores a range in a detached document", () => {
    const doc = document.implementation.createHTMLDocument("epub")
    doc.body.innerHTML =
      "<p>Chapter One Alpha body text</p><p>Second paragraph</p>"
    const paragraph = doc.body.querySelector("p") as HTMLParagraphElement
    const textNode = paragraph.firstChild as Text
    const range = doc.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 7)

    const serialized = serializeRangePaths(range)
    expect(serialized?.start).toBeTruthy()

    const restored = deserializeRange(serialized ?? undefined, doc)
    expect(restored?.toString()).toBe("Chapter")

    const byText = findRangeByNormalizedText(doc.body, "body text")
    expect(byText?.toString()).toBe("body text")
  })
})

describe("record schema with epubLocator", () => {
  const base = {
    schemaVersion: "1.0.0",
    id: "r1",
    kind: "highlight",
    text: "hello",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    url: "myz-epub:abc",
  }

  it("keeps an epub record with locator and source type", () => {
    const parsed = MyZRecordSchemaV1.parse({
      ...base,
      sourceType: "epub",
      epubLocator: { spineIndex: 1, progression: 0.5, textQuote: "hello" },
    })
    expect(parsed.epubLocator?.spineIndex).toBe(1)
    expect(parsed.sourceType).toBe("epub")
  })

  it("still parses records without a locator", () => {
    const parsed = MyZRecordSchemaV1.parse(base)
    expect(parsed.epubLocator).toBeUndefined()
  })
})
