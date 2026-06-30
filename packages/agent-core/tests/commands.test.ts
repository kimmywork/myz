import assert from "node:assert/strict"
import test from "node:test"
import { createCommands, type CommandContext } from "../src/index"

function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    config: {
      runtimeRoot: "/tmp/myz",
      workspaceRoot: process.cwd(),
      workspaceId: "test",
      providers: {},
      defaults: { provider: "p", model: "m" },
      permissions: [],
      skills: { allowlist: [], denylist: [] },
      browser: { enabled: true, headless: true },
      context: {
        strategy: "summary",
        summaryThresholdRatio: 0.8,
        recentWindowRatio: 0.3,
        summaryMaxTokens: 2000,
      },
      sessionsDir: "/tmp/myz/sessions",
      attachmentsDir: "/tmp/myz/attachments",
    },
    currentAgentId: "build",
    sessionId: "s-test",
    switchAgent: () => {},
    switchModel: () => {},
    getAvailableModels: () => [],
    listSessions: () => [],
    listTools: () => [],
    getSessionTokens: () => ({ used: 0, total: 0 }),
    compactSession: () => ({ compressed: false, summary: "", messageCount: 0 }),
    clearSession: () => {},
    ...overrides,
  }
}

test("/tools lists registered tools", async () => {
  const command = createCommands().find((item) => item.name === "tools")
  assert.ok(command)

  const result = await command.handler([], createContext({
    listTools: () => [
      { name: "Read", description: "读取文件" },
      { name: "Run", description: "执行命令" },
    ],
  }))

  assert.equal(result, "可用工具：\n  - Read: 读取文件\n  - Run: 执行命令")
})

test("/compact reports runtime compaction result", async () => {
  const command = createCommands().find((item) => item.name === "compact")
  assert.ok(command)

  const result = await command.handler([], createContext({
    compactSession: () => ({ compressed: true, summary: "已保留关键上下文", messageCount: 3 }),
  }))

  assert.equal(result, "上下文已压缩。\n当前保留消息数: 3\n摘要：\n已保留关键上下文")
})
