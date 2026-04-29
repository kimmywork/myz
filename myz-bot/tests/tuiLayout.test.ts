import assert from "node:assert/strict"
import { test } from "node:test"
import { computeChatWidth, isCompactLayout } from "../src/tui/layout"

test("tui layout enters compact mode below width threshold", () => {
  assert.equal(isCompactLayout({ width: 109, height: 40 }), true)
  assert.equal(isCompactLayout({ width: 120, height: 40 }), false)
})

test("tui layout computes chat width for compact and wide screens", () => {
  assert.equal(computeChatWidth(100, true), 90)
  assert.equal(computeChatWidth(160, false), 104)
})
