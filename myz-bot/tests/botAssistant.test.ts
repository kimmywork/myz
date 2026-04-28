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

test("bot assistant prompt requires real document writes for persistent user facts", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    conversationSummary: "",
    replyMode: "required",
    user: {},
  })

  assert.match(prompt, /优先更新合适的 workspace 文档/)
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
  assert.doesNotMatch(prompt, /\/workspace\/memory\/MEMORY\.md/)
  assert.match(prompt, /默认不会内嵌进对话上下文/)
  assert.doesNotMatch(prompt, /发送消息工具/)
  assert.match(prompt, /planning-mode/)
  assert.match(prompt, /Task/)
})

test("bot assistant context prompt exposes only compressed summary", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildContextPrompt({
    conversationSummary: "会话压缩摘要\n\n用户最近在整理 bot 的长期记忆。",
    replyMode: "required",
    user: {},
  })

  assert.match(prompt, /当前会话摘要：/)
  assert.match(prompt, /用户最近在整理 bot 的长期记忆/)
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
    replyMode: "required",
    scope: "private",
    user: {},
  })

  assert.doesNotMatch(prompt, /会话压缩摘要/)
  assert.match(prompt, /默认不会内嵌进对话上下文/)
})
