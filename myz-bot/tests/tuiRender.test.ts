import assert from "node:assert/strict"
import { test } from "node:test"
import { resolveChatScrollPerc } from "../src/tui/render"

test("tui render keeps the conversation pane pinned when follow mode is enabled", () => {
  assert.equal(
    resolveChatScrollPerc({
      previousScrollPerc: 37,
      stickToBottom: true,
    }),
    100,
  )
})

test("tui render preserves manual conversation scroll position", () => {
  assert.equal(
    resolveChatScrollPerc({
      previousScrollPerc: 37,
      stickToBottom: false,
    }),
    37,
  )
})
