import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createBotAssistantAgent } from "../src/agents/botAssistant"

test("bot assistant prompt requires NO_REPLY in optional mode", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    conversationSummary: "",
    replyMode: "optional",
    user: {},
  })

  assert.match(prompt, /NO_REPLY/)
})

test("bot assistant prompt disallows NO_REPLY in required mode", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    conversationSummary: "",
    replyMode: "required",
    user: {},
  })

  assert.match(prompt, /不允许输出 `NO_REPLY`/)
})

test("bot assistant prompt exposes session workspace as default workdir", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    conversationSummary: "",
    replyMode: "required",
    sessionWorkspace: "/tmp/workspace",
    user: {},
  })

  assert.match(prompt, /当前默认工作目录是 \/tmp\/workspace/)
  assert.match(prompt, /\/workspace/)
  assert.match(prompt, /\/attachments/)
  assert.doesNotMatch(prompt, /\/bot/)
})

test("bot assistant prompt requires real memory writes for explicit remember requests", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    conversationSummary: "",
    replyMode: "required",
    user: {},
  })

  assert.match(prompt, /优先写入共享记忆/)
  assert.match(prompt, /不要声称自己已经记住/)
})

test("bot assistant prompt exposes workspace doc locations instead of injecting content", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    conversationSummary: "",
    replyMode: "required",
    scope: "private",
    user: {},
  })

  assert.match(prompt, /工作区文档约定：/)
  assert.match(prompt, /\/workspace\/AGENTS\.md/)
  assert.match(prompt, /\/workspace\/IDENTITY\.md/)
  assert.match(prompt, /\/workspace\/SOUL\.md/)
  assert.match(prompt, /\/workspace\/USER\.md/)
  assert.match(prompt, /\/workspace\/memory\/MEMORY\.md/)
  assert.match(prompt, /默认不会内嵌进对话上下文/)
  assert.match(prompt, /发送消息工具/)
})

test("bot assistant context prompt exposes only summary and recovered context", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildContextPrompt({
    conversationSummary: "会话压缩摘要\n\n用户最近在整理 bot 的长期记忆。",
    recoveredContext: "## 恢复上下文\n- 上轮压缩时保留了长期线索。",
    replyMode: "required",
    user: {},
  })

  assert.match(prompt, /当前会话摘要：/)
  assert.match(prompt, /用户最近在整理 bot 的长期记忆/)
  assert.match(prompt, /恢复上下文：/)
  assert.match(prompt, /上轮压缩时保留了长期线索/)
})

test("bot assistant context prompt can be empty when no compressed context exists", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-agent-"))
  const agent = createBotAssistantAgent({ workspaceRoot: root })
  const prompt = agent.buildContextPrompt({
    conversationSummary: "",
    replyMode: "required",
    user: {},
  })

  assert.equal(prompt, "")
})

test("bot assistant prompt keeps compressed context out of the stable system prompt", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-agent-"))
  const agent = createBotAssistantAgent({ workspaceRoot: root })
  const prompt = agent.buildSystemPrompt({
    conversationSummary: "会话压缩摘要",
    recoveredContext: "## 恢复上下文\n- 用户喜欢简洁。",
    replyMode: "required",
    scope: "private",
    user: {},
  })

  assert.doesNotMatch(prompt, /会话压缩摘要/)
  assert.doesNotMatch(prompt, /恢复上下文：/)
  assert.match(prompt, /默认不会内嵌进对话上下文/)
})
