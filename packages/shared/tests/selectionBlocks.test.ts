import { describe, expect, it } from "vitest"
import { selectionBlocks } from "../src/selectionBlocks"

function makeDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument("t")
  doc.body.innerHTML = html
  return doc
}

function rangeOver(doc: Document, selector: string): Range {
  const range = doc.createRange()
  const el = doc.querySelector(selector)!
  range.selectNodeContents(el)
  return range
}

describe("selectionBlocks", () => {
  it("returns one block per paragraph, heading and list item", () => {
    const doc = makeDoc(
      "<h2>Heading</h2><p>Body one.</p><ul><li>Item one</li><li>Item two</li></ul>",
    )
    expect(selectionBlocks(rangeOver(doc, "body"))).toEqual([
      "Heading",
      "Body one.",
      "Item one",
      "Item two",
    ])
  })

  it("keeps inline runs together within a block", () => {
    const doc = makeDoc("<p>Hello <b>bold</b> world</p>")
    expect(selectionBlocks(rangeOver(doc, "p"))).toEqual(["Hello bold world"])
  })

  it("handles a partial selection inside one block", () => {
    const doc = makeDoc("<p>Alpha beta gamma</p>")
    const text = doc.querySelector("p")!.firstChild as Text
    const range = doc.createRange()
    range.setStart(text, 0)
    range.setEnd(text, 5)
    expect(selectionBlocks(range)).toEqual(["Alpha"])
  })

  it("returns nothing for a collapsed range", () => {
    const doc = makeDoc("<p>Alpha</p>")
    const range = doc.createRange()
    range.selectNodeContents(doc.querySelector("p")!)
    range.collapse(true)
    expect(selectionBlocks(range)).toEqual([])
  })
})
