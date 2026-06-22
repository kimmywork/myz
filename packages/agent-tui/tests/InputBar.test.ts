import assert from "node:assert/strict"
import test from "node:test"
import { __getCursorPositionForTest, __wrapInputForTest } from "../src/InputBar"

test("InputBar wrapping treats pasted newlines as real rows", () => {
  const value = "First Line\nSecond Line\n第三行"
  const lines = __wrapInputForTest(value, 80)

  assert.deepEqual(lines.map((line) => line.text), ["First Line", "Second Line", "第三行"])
  assert.deepEqual(__getCursorPositionForTest(lines, value.length), { row: 2, col: 6 })
})

test("InputBar wrapping moves cursor to next row after soft wrap", () => {
  const value = "abcdef"
  const lines = __wrapInputForTest(value, 3)

  assert.deepEqual(lines.map((line) => line.text), ["abc", "def", ""])
  assert.deepEqual(__getCursorPositionForTest(lines, 3), { row: 1, col: 0 })
  assert.deepEqual(__getCursorPositionForTest(lines, value.length), { row: 2, col: 0 })
})
