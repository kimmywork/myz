import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { renderToString } from "ink"
import { ChatHistory, type ChatEntry } from "../src/ChatHistory"

test("ChatHistory renders v22 transcript roles", () => {
  const entries: ChatEntry[] = [
    { role: "user", text: "First line" },
    { role: "assistant", text: "# Title\n- **done**" },
    { role: "tool_use", toolName: "Read", text: "▸ Read", detail: "Arguments:\n{}", expanded: false },
  ]

  const frame = renderToString(React.createElement(ChatHistory, { entries }))

  assert.match(frame, /\[YOU\]/)
  assert.match(frame, /First line/)
  assert.match(frame, /\[AI\]/)
  assert.match(frame, /Title/)
  assert.match(frame, /\[TOOL\]/)
  assert.match(frame, /Read/)
  assert.doesNotMatch(frame, /Arguments:/)
})

test("ChatHistory preserves chronological thinking/content/tool segments", () => {
  const entries: ChatEntry[] = [
    { role: "reasoning", text: "Thinking: inspect files", detail: "inspect files", expanded: false },
    { role: "assistant", text: "I will read the config." },
    { role: "tool_use", toolName: "Read", text: "✓ Read", detail: "Result:\nok", expanded: false },
    { role: "reasoning", text: "Thinking: analyze result", detail: "analyze result", expanded: false },
    { role: "assistant", text: "The config is valid." },
  ]

  const frame = renderToString(React.createElement(ChatHistory, { entries }))
  const firstThink = frame.indexOf("Thinking: inspect files")
  const firstAi = frame.indexOf("I will read the config.")
  const tool = frame.indexOf("✓ Read")
  const secondThink = frame.indexOf("Thinking: analyze result")
  const secondAi = frame.indexOf("The config is valid.")

  assert.ok(firstThink >= 0)
  assert.ok(firstThink < firstAi)
  assert.ok(firstAi < tool)
  assert.ok(tool < secondThink)
  assert.ok(secondThink < secondAi)
})

test("ChatHistory renders expanded tool details", () => {
  const entries: ChatEntry[] = [
    { role: "tool_use", toolName: "Read", text: "✓ Read", detail: "Arguments:\n{\n  \"path\": \"README.md\"\n}\n\nResult:\nok", expanded: true },
  ]

  const frame = renderToString(React.createElement(ChatHistory, { entries }))

  assert.match(frame, /\[TOOL\]/)
  assert.match(frame, /Arguments:/)
  assert.match(frame, /README\.md/)
  assert.match(frame, /Result:/)
})
