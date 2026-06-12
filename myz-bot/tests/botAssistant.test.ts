import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createBotAssistantAgent } from "../src/agents/botAssistant"

test("bot assistant prompt includes workspace path", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    conversationSummary: "",
    replyMode: "required",
    sessionWorkspace: "/tmp/workspace",
    user: {},
  })

  assert.match(prompt, /\/tmp\/workspace/)
})

test("bot assistant prompt includes knowledge system info", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    conversationSummary: "",
    replyMode: "required",
    user: {},
  })

  assert.match(prompt, /知识架构/)
  assert.match(prompt, /Conceptual/)
  assert.match(prompt, /Structural/)
  assert.match(prompt, /Behavioral/)
  assert.match(prompt, /Operational/)
  assert.match(prompt, /INK\.md/)
})

test("bot assistant prompt includes session commands", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildSystemPrompt({
    conversationSummary: "",
    replyMode: "required",
    user: {},
  })

  assert.match(prompt, /\/clear/)
  assert.match(prompt, /\/resume/)
  assert.match(prompt, /\/fork/)
})

test("bot assistant context prompt exposes summary", () => {
  const agent = createBotAssistantAgent({ workspaceRoot: "/tmp/workspace" })
  const prompt = agent.buildContextPrompt({
    conversationSummary: "用户在讨论知识库设计",
    replyMode: "required",
    user: {},
  })

  assert.match(prompt, /会话摘要/)
  assert.match(prompt, /用户在讨论知识库设计/)
})

test("bot assistant context prompt is empty when no summary", () => {
  const root = mkdtempSync(join(tmpdir(), "myz-bot-agent-"))
  const agent = createBotAssistantAgent({ workspaceRoot: root })
  const prompt = agent.buildContextPrompt({
    conversationSummary: "",
    replyMode: "required",
    user: {},
  })

  assert.equal(prompt, "")
})
