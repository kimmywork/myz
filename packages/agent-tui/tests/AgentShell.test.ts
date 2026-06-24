import assert from "node:assert/strict"
import test from "node:test"
import { __estimateEntryRowsForTest, __selectVisibleEntriesForTest } from "../src/AgentShell"
import type { ChatEntry } from "../src/ChatHistory"

test("AgentShell transcript viewport keeps only entries that fit", () => {
  const entries: ChatEntry[] = Array.from({ length: 20 }, (_, index) => ({
    id: `entry-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    text: `message ${index}`,
  }))

  const visible = __selectVisibleEntriesForTest(entries, 9, 80)
  const rows = visible.reduce((total, entry) => total + __estimateEntryRowsForTest(entry, 80), 0)

  assert.ok(visible.length < entries.length)
  assert.ok(rows <= 9)
  assert.equal(visible.at(-1)?.text, "message 19")
})

test("AgentShell transcript viewport clips oversized last entry to its tail", () => {
  const entries: ChatEntry[] = [{
    id: "large-ai",
    role: "assistant",
    text: Array.from({ length: 30 }, (_, index) => `line ${index}`).join("\n"),
  }]

  const visible = __selectVisibleEntriesForTest(entries, 8, 80)

  assert.equal(visible.length, 1)
  assert.match(visible[0].text, /^…/)
  assert.doesNotMatch(visible[0].text, /line 0/)
  assert.match(visible[0].text, /line 29/)
})
