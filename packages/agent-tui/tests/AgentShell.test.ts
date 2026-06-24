import assert from "node:assert/strict"
import test from "node:test"
import { __splitEntriesForTest } from "../src/AgentShell"
import type { ChatEntry } from "../src/ChatHistory"

test("AgentShell splits complete transcript entries from pending live entries", () => {
  const entries: ChatEntry[] = [
    { id: "u1", role: "user", text: "hello" },
    { id: "t1", role: "reasoning", text: "Thinking…", status: "pending" },
    { id: "a1", role: "assistant", text: "done", status: "complete" },
    { id: "tool1", role: "tool_use", toolName: "Read", text: "▸ Read", status: "pending" },
  ]

  const { completeEntries, pendingEntries } = __splitEntriesForTest(entries)

  assert.deepEqual(completeEntries.map((entry) => entry.id), ["u1", "a1"])
  assert.deepEqual(pendingEntries.map((entry) => entry.id), ["t1", "tool1"])
})
