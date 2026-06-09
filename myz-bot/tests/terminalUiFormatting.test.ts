import assert from "node:assert/strict"
import { test } from "node:test"
import { buildMeter, renderChatEntry, wrapText } from "../src/tui/formatting"

test("wrapText preserves explicit line breaks", () => {
  const lines = wrapText("第一段\n\n第二段", 40)

  assert.deepEqual(lines, ["第一段", "", "第二段"])
})

test("wrapText wraps full-width text by display width", () => {
  const lines = wrapText("你好世界你好世界你好", 16)

  assert.deepEqual(lines, ["你好世界你好世界", "你好"])
})

test("renderChatEntry keeps ascii separators and escaped content", () => {
  const rendered = renderChatEntry({
    chatWidth: 48,
    entry: {
      role: "user",
      at: "2026-04-29T10:25:27.000Z",
      sessionId: "c{1}",
      text: "第一行\n第二行 {tag}",
    },
  }).content

  assert.match(rendered, /YOU/)
  assert.match(rendered, /10:25:27/)
  assert.match(rendered, /c\\\{1\\\}/)
  assert.match(rendered, /第二行 \\\{tag\\\}/)
  assert.doesNotMatch(rendered, /[─┈█░]/)
})

test("buildMeter uses ascii characters only", () => {
  assert.equal(buildMeter(3, 4, 4), "###-")
})
