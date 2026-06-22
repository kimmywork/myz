// Test script: render TUI with test data
import React from "react"
import { render } from "ink"
import { AgentShell } from "@myz/agent-tui"

const entries = [
  { role: "user", text: "你好" },
  { role: "assistant", text: "你好！我是 myz agent，可以帮你处理代码、文件和命令。\n\n**功能列表**：\n- `Read` / `Write` / `Edit` 文件操作\n- `Run` 执行命令\n- `List` / `Glob` 文件搜索\n- `Task` 调用子 agent" },
  { role: "tool_use", text: "Read", detail: "path: src/config.ts\ncontent: import { readFileSync } from 'node:fs'..." },
  { role: "reasoning", text: "用户想了解项目结构", detail: "让我先读取项目配置文件来了解技术栈和依赖关系。" },
]

const { unmount } = render(
  React.createElement(AgentShell, {
    agentId: "build",
    sessionId: "test-123",
    model: "sensenova/deepseek-v4-flash",
    workspace: "/Users/qliu23/workspace/fe/myz",
    tokenUsed: 1234,
    tokenTotal: 256000,
    version: "0.2.0",
    entries,
    onMessage: (text: string) => console.log("\nUSER INPUT:", text),
  })
)

setTimeout(() => {
  console.log("\n--- TUI rendered OK ---")
  unmount()
  process.exit(0)
}, 3000)
