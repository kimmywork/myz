import { describe, expect, it } from "vitest"
import { wrapRangeAcrossNodes } from "../src/highlightRange"

function makeDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument("t")
  doc.body.innerHTML = html
  return doc
}

function markerFactory(doc: Document) {
  return () => {
    const mark = doc.createElement("mark")
    mark.className = "hl"
    return mark
  }
}

describe("wrapRangeAcrossNodes", () => {
  it("splits a multi-block range so no mark contains a block element", () => {
    const doc = makeDoc(
      "<p>one two</p><ul><li>alpha</li><li>beta</li></ul><h2>tail</h2>",
    )
    const range = doc.createRange()
    range.selectNodeContents(doc.body)

    expect(wrapRangeAcrossNodes(range, markerFactory(doc))).toBe(true)

    const marks = Array.from(doc.querySelectorAll("mark.hl"))
    expect(marks.length).toBeGreaterThan(1)
    marks.forEach((mark) => {
      expect(mark.querySelector("p, ul, li, h2, div")).toBeNull()
    })
    expect(doc.body.textContent).toContain("alpha")
    expect(doc.querySelectorAll("h2").length).toBe(1)
  })

  it("wraps a partial single-node selection", () => {
    const doc = makeDoc("<p>hello world</p>")
    const text = doc.querySelector("p")!.firstChild as Text
    const range = doc.createRange()
    range.setStart(text, 6)
    range.setEnd(text, 11)

    expect(wrapRangeAcrossNodes(range, markerFactory(doc))).toBe(true)

    const mark = doc.querySelector("mark.hl")
    expect(mark?.textContent).toBe("world")
    expect(doc.querySelector("p")?.textContent).toBe("hello world")
  })
})
