import assert from "node:assert/strict"
import test from "node:test"
import React from "react"
import { renderToString } from "ink"
import { AgentShell, type ChatEntry } from "@myz/agent-tui"

test("AgentShell renders v22 transcript entries above input and status", () => {
  const entries: ChatEntry[] = [
    { role: "user", text: "你好" },
    { role: "assistant", text: "你好！我是 myz agent。\n\n**功能列表**：\n- `Read` 文件操作" },
    { role: "tool_use", toolName: "Read", text: "✓ Read", detail: "Arguments:\n{\n  \"path\": \"src/config.ts\"\n}\n\nResult:\nok", expanded: false },
    { role: "reasoning", text: "Thinking…", detail: "让我先读取项目配置文件来了解技术栈。", expanded: false },
  ]

  const frame = renderToString(
    React.createElement(AgentShell, {
      agentId: "build",
      sessionId: "test-123",
      model: "sensenova/deepseek-v4-flash",
      workspace: "/Users/qliu23/workspace/fe/myz",
      tokenUsed: 1234,
      tokenTotal: 256000,
      version: "0.2.0",
      entries,
      onMessage: () => {},
    }),
  )

  assert.match(frame, /\[YOU\]/)
  assert.match(frame, /你好/)
  assert.match(frame, /\[AI\]/)
  assert.match(frame, /功能列表/)
  assert.match(frame, /\[TOOL\]/)
  assert.match(frame, /Read/)
  assert.match(frame, /\[THINK\]/)
  assert.match(frame, /Thinking/)
  assert.match(frame, /build/)
  assert.match(frame, /deepseek-v4-flash/)
})
