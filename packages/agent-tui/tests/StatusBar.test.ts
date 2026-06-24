import assert from "node:assert/strict"
import test from "node:test"
import stringWidth from "string-width"
import { __formatStatusLineForTest } from "../src/StatusBar"

test("StatusBar keeps one-line content within terminal width", () => {
  const line = __formatStatusLineForTest({
    workspace: "/Users/qliu23/workspace/fe/myz",
    model: "sensenova/deepseek-v4-flash",
    tokenUsed: 1234,
    tokenTotal: 256000,
    agent: "build",
    version: "0.2.0",
  }, 80)

  assert.ok(stringWidth(line) <= 76)
  assert.match(line, /deepseek-v4-flash|deepseek-v4…|sensenova\/deepseek/)
  assert.match(line, /1234\/256000/)
  assert.match(line, /build/)
})
