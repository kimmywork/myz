import assert from "node:assert/strict"
import { test } from "node:test"
import { createInputHistoryController } from "../src/tui/history"

test("tui history restores the draft when leaving history browsing", () => {
  const history = createInputHistoryController(5)
  history.remember("first")
  history.remember("second")

  assert.equal(history.move(-1, "draft") , "second")
  assert.equal(history.move(1, "ignored"), "draft")
  assert.equal(history.isBrowsing(), false)
})

test("tui history deduplicates adjacent entries and keeps the newest slice", () => {
  const history = createInputHistoryController(2)
  history.remember("one")
  history.remember("one")
  history.remember("two")
  history.remember("three")

  assert.equal(history.move(-1, ""), "three")
  assert.equal(history.move(-1, ""), "two")
  assert.equal(history.move(-1, ""), "two")
})
