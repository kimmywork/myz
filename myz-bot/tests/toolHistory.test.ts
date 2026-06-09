import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ensureSessionDir, getSessionHistoryPath, getSessionTracePath } from "../src/sessions"
import { appendToolAuditTrace, appendToolMessagesToSessionHistory } from "../src/toolHistory"

test("tool history appends assistant tool calls and tool results to llm history", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tool-history-"))
  const sessionDir = ensureSessionDir(join(root, "sessions"), "100-1")

  appendToolMessagesToSessionHistory({
    sessionId: "100-1",
    sessionDir,
    trace: [
      {
        role: "assistant",
        content: "我先看一下文件",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "Read",
              arguments: "{\"path\":\"/workspace/a.md\"}",
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call-1",
        content: "# A\nhello",
        metadata: {
          toolName: "Read",
          toolArgs: "{\"path\":\"/workspace/a.md\"}",
        },
      },
    ],
  })

  const history = readFileSync(getSessionHistoryPath(sessionDir), "utf-8")
  assert.match(history, /"role":"assistant"/)
  assert.match(history, /"tool_calls":\[/)
  assert.match(history, /"role":"tool"/)
  assert.match(history, /# A\\nhello/)
})

test("tool audit trace stays in llm-trace and is marked as tool_audit", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-tool-history-"))
  const sessionDir = ensureSessionDir(join(root, "sessions"), "100-1")

  appendToolAuditTrace({
    sessionId: "100-1",
    sessionDir,
    trace: [
      {
        role: "assistant",
        content: "我先看一下文件",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "Read",
              arguments: "{\"path\":\"/workspace/a.md\"}",
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call-1",
        content: "# A\nhello",
        metadata: {
          toolName: "Read",
        },
      },
    ],
  })

  const trace = readFileSync(getSessionTracePath(sessionDir), "utf-8")
  assert.match(trace, /tool_audit/)
  assert.match(trace, /"role":"tool"/)
})
